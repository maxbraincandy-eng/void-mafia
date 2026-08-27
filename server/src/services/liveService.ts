/**
 * Going live.
 *
 * THE INFRASTRUCTURE QUESTION IS ALREADY ANSWERED
 * ───────────────────────────────────────────────
 * The spec flags "WebRTC for the MVP, or a managed provider" as a decision
 * needing a cost discussion. It is not open: LiveKit is already integrated,
 * already carries every voice room in the app, and `/livekit/status` answers
 * `enabled: true` in production. Building a second WebRTC path beside it would
 * mean two signalling systems, two sets of TURN problems and two things to fix
 * when a phone drops off wifi — for a feature the existing one already serves.
 *
 * So a broadcast is a LiveKit room like every other, named `live_<sessionId>`,
 * with one publisher. The rooms need no new server, no new key and no new bill.
 *
 * WHAT THIS SERVICE OWNS
 * ──────────────────────
 * Not the media — LiveKit has that. This owns the part LiveKit does not: who is
 * live, what they called it, who may watch, how many are watching, what the
 * peak was, and the summary at the end.
 *
 * LIVE IS A HEARTBEAT, NOT A FLAG
 * ───────────────────────────────
 * A host whose phone dies never sends "I stopped". If live meant `ended_at IS
 * NULL` their avatar would wear a LIVE ring until somebody noticed, and tapping
 * it would open an empty room. So a session is live only while it is still
 * beating, and one that stops is reaped.
 */

import { randomBytes } from 'crypto';
import { sql } from '../db.js';

/** Longer than the client's beat, short enough that a dead stream clears fast. */
export const BEAT_TIMEOUT_MS = 45_000;
/** What the client should aim for. Three misses inside the timeout. */
export const BEAT_INTERVAL_MS = 15_000;

export type LiveVisibility = 'public' | 'friends';
export type LiveStatus = 'live' | 'ended';

export interface LiveSession {
  id: string;
  hostId: string;
  hostName: string;
  hostAvatar: string;
  hostAvatarUrl: string | null;
  title: string;
  visibility: LiveVisibility;
  /** "Playing mafia — join me": a room code, or null. */
  gameContext: string | null;
  status: LiveStatus;
  startedAt: number;
  endedAt: number | null;
  viewers: number;
  peakViewers: number;
  totalViewers: number;
  totalHearts: number;
  /** The LiveKit room to join. Derived, never stored — one less thing to desync. */
  room: string;
}

/** The LiveKit room a session broadcasts in. */
export function roomFor(sessionId: string): string {
  return `live_${sessionId}`;
}

/*
 * Who is watching what, right now.
 *
 * In memory rather than in the table, because it changes on every tab close and
 * every lift dropping out of signal, and none of that is worth a write. The
 * table records that somebody watched; this counts who is watching.
 *
 * Lost on restart, which is correct: after a restart nobody is connected to
 * anything anyway, and the reaper clears the sessions behind them.
 */
const watching = new Map<string, Set<string>>();

function viewerCount(sessionId: string): number {
  return watching.get(sessionId)?.size ?? 0;
}

const clean = (s: unknown, max: number): string => String(s ?? '').trim().slice(0, max);

function rowToSession(r: any): LiveSession {
  return {
    id: r.id,
    hostId: r.host_id,
    hostName: r.username ?? '',
    hostAvatar: r.avatar ?? '',
    hostAvatarUrl: r.avatar_url ?? null,
    title: r.title ?? '',
    visibility: (r.visibility ?? 'public') as LiveVisibility,
    gameContext: r.game_context ?? null,
    status: (r.status ?? 'live') as LiveStatus,
    startedAt: Number(r.started_at),
    endedAt: r.ended_at != null ? Number(r.ended_at) : null,
    viewers: viewerCount(r.id),
    peakViewers: Number(r.peak_viewers ?? 0),
    totalViewers: Number(r.total_viewers ?? 0),
    totalHearts: Number(r.total_hearts ?? 0),
    room: roomFor(r.id),
  };
}

const SELECT_SESSION = sql`
  SELECT s.*, p.username, p.avatar, p.avatar_url
  FROM live_sessions s LEFT JOIN players p ON p.id = s.host_id
`;

// ── Starting and stopping ─────────────────────────────────────────────────────

/**
 * Go live.
 *
 * One broadcast per person. Starting a second ends the first rather than
 * refusing: the usual way to get here twice is a host whose app was killed and
 * reopened, and telling them "you are already live" when they can see they are
 * not is worse than quietly replacing a session nobody is watching.
 */
export async function startLive(
  hostId: string,
  opts: { title?: string; visibility?: LiveVisibility; gameContext?: string | null },
): Promise<LiveSession> {
  await endLive(hostId, { reason: 'replaced' });

  const id = `live_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
  const now = Date.now();
  await sql`
    INSERT INTO live_sessions (id, host_id, title, visibility, game_context, status, started_at, last_beat_at)
    VALUES (
      ${id}, ${hostId}, ${clean(opts.title, 120)},
      ${opts.visibility === 'friends' ? 'friends' : 'public'},
      ${opts.gameContext ? clean(opts.gameContext, 40) : null},
      'live', ${now}, ${now}
    )
  `;
  watching.set(id, new Set());
  const [row] = await sql`${SELECT_SESSION} WHERE s.id = ${id}` as any[];
  return rowToSession(row);
}

/**
 * Stop broadcasting, and return the summary.
 *
 * Idempotent: ending an already-ended session returns what it was rather than
 * failing, because "end" arrives from the button, from the socket closing and
 * from the reaper, and any two of them can race.
 */
export async function endLive(
  hostId: string,
  opts: { reason?: string } = {},
): Promise<LiveSession | null> {
  const [row] = await sql`
    SELECT id FROM live_sessions WHERE host_id = ${hostId} AND status = 'live' LIMIT 1
  ` as any[];
  if (!row) return null;
  return endSession(String(row.id), opts.reason);
}

async function endSession(sessionId: string, _reason?: string): Promise<LiveSession | null> {
  const now = Date.now();
  await sql`
    UPDATE live_sessions SET status = 'ended', ended_at = ${now}
    WHERE id = ${sessionId} AND status = 'live'
  `;
  await sql`UPDATE live_viewers SET left_at = ${now} WHERE session_id = ${sessionId} AND left_at IS NULL`;
  watching.delete(sessionId);
  const [row] = await sql`${SELECT_SESSION} WHERE s.id = ${sessionId}` as any[];
  return row ? rowToSession(row) : null;
}

/**
 * "Still here."
 *
 * Returns the session id, or null when the session is gone — which is the
 * client's signal to stop showing a broadcast screen for a stream that no
 * longer exists.
 *
 * The id is returned rather than a bare `true` because the socket layer uses
 * the beat to re-join the host to their own broadcast room. A host whose phone
 * changed networks gets a new socket, and a new socket is in no rooms — without
 * something that re-joins on a schedule, they carry on broadcasting to a room
 * they are no longer listening to, and their viewer count freezes.
 */
export async function beat(hostId: string): Promise<string | null> {
  const rows = await sql`
    UPDATE live_sessions SET last_beat_at = ${Date.now()}
    WHERE host_id = ${hostId} AND status = 'live'
    RETURNING id
  ` as any[];
  return rows.length > 0 ? String(rows[0].id) : null;
}

/**
 * End every session that has stopped beating.
 *
 * The one thing standing between a host whose battery died and an avatar that
 * wears a LIVE ring until somebody files a bug.
 */
export async function reapStale(): Promise<number> {
  const cutoff = Date.now() - BEAT_TIMEOUT_MS;
  const rows = await sql`
    SELECT id FROM live_sessions WHERE status = 'live' AND last_beat_at < ${cutoff}
  ` as any[];
  for (const r of rows) await endSession(String(r.id), 'timeout');
  return rows.length;
}

// ── Watching ──────────────────────────────────────────────────────────────────

/**
 * Join as a viewer.
 *
 * Peak concurrency is recorded here because it can only be observed while it is
 * happening — no counter recovers it afterwards. `total_viewers` counts people,
 * not joins, so somebody whose train goes into a tunnel does not inflate it.
 */
export async function joinLive(sessionId: string, userId: string): Promise<LiveSession | null> {
  const [row] = await sql`${SELECT_SESSION} WHERE s.id = ${sessionId} AND s.status = 'live'` as any[];
  if (!row) return null;

  let set = watching.get(sessionId);
  if (!set) { set = new Set(); watching.set(sessionId, set); }
  const isNewToTheRoom = !set.has(userId);
  set.add(userId);

  if (isNewToTheRoom) {
    const seen = await sql`
      SELECT 1 FROM live_viewers WHERE session_id = ${sessionId} AND user_id = ${userId} LIMIT 1
    ` as any[];
    await sql`
      INSERT INTO live_viewers (session_id, user_id, joined_at) VALUES (${sessionId}, ${userId}, ${Date.now()})
      ON CONFLICT DO NOTHING
    `;
    if (seen.length === 0) {
      await sql`UPDATE live_sessions SET total_viewers = total_viewers + 1 WHERE id = ${sessionId}`;
    }
  }

  await sql`
    UPDATE live_sessions SET peak_viewers = GREATEST(peak_viewers, ${set.size}) WHERE id = ${sessionId}
  `;
  const [fresh] = await sql`${SELECT_SESSION} WHERE s.id = ${sessionId}` as any[];
  return rowToSession(fresh);
}

export async function leaveLive(sessionId: string, userId: string): Promise<number> {
  watching.get(sessionId)?.delete(userId);
  await sql`
    UPDATE live_viewers SET left_at = ${Date.now()}
    WHERE session_id = ${sessionId} AND user_id = ${userId} AND left_at IS NULL
  `;
  return viewerCount(sessionId);
}

/**
 * Somebody left the app entirely — drop them from whatever they were watching.
 *
 * The remaining count comes back with each session because the caller has to
 * broadcast it, and it has no other way to know. The first version returned
 * only the ids and the socket layer then announced `viewers: 0` for each — so
 * one person of thirty closing a tab emptied the room on everybody's screen.
 */
export function forgetViewer(userId: string): { sessionId: string; viewers: number }[] {
  const touched: { sessionId: string; viewers: number }[] = [];
  for (const [sessionId, set] of watching) {
    if (set.delete(userId)) touched.push({ sessionId, viewers: set.size });
  }
  return touched;
}

/**
 * Who is in the room right now, with enough to draw them.
 *
 * The count alone answers "is anyone there"; a host talking to a camera wants
 * the other half of that — which is why every product that ships a count also
 * ships the list behind it.
 */
export async function viewersOf(sessionId: string): Promise<LiveViewer[]> {
  const ids = [...(watching.get(sessionId) ?? [])];
  if (ids.length === 0) return [];
  const rows = await sql`
    SELECT id, username, avatar, avatar_url FROM players WHERE id = ANY(${ids})
  ` as any[];
  return rows.map(r => ({
    userId: String(r.id),
    name: r.username ?? '',
    avatar: r.avatar ?? '',
    avatarUrl: r.avatar_url ?? null,
  }));
}

export interface LiveViewer {
  userId: string;
  name: string;
  avatar: string;
  avatarUrl: string | null;
}

/**
 * A heart.
 *
 * Counted, not stored. At a few taps a second per viewer the individual
 * reactions are worth nothing an hour later and a great deal of write traffic
 * now — the burst is the point, and the burst is broadcast, not persisted.
 *
 * The running total comes back so it can ride along on the broadcast. A host
 * only ever saw hearts as animations flying past, which is unreadable as a
 * quantity: two hundred hearts and twenty look the same at a glance.
 */
export async function addHearts(sessionId: string, n = 1): Promise<number> {
  const count = Math.max(1, Math.min(20, Math.floor(n)));
  const rows = await sql`
    UPDATE live_sessions SET total_hearts = total_hearts + ${count}
    WHERE id = ${sessionId} AND status = 'live'
    RETURNING total_hearts
  ` as any[];
  return rows.length > 0 ? Number(rows[0].total_hearts) : 0;
}

// ── Reading ───────────────────────────────────────────────────────────────────

export async function getSession(sessionId: string): Promise<LiveSession | null> {
  const [row] = await sql`${SELECT_SESSION} WHERE s.id = ${sessionId}` as any[];
  return row ? rowToSession(row) : null;
}

/** Everybody broadcasting right now, newest first. */
export async function listLive(limit = 50): Promise<LiveSession[]> {
  const rows = await sql`
    ${SELECT_SESSION} WHERE s.status = 'live' ORDER BY s.started_at DESC LIMIT ${Math.min(100, limit)}
  ` as any[];
  return rows.map(rowToSession);
}

/**
 * Which of these people are live, in one question.
 *
 * The badge renders beside every name in the feed, the friend list and every
 * lobby. Asking per avatar is how a list becomes slow, so the client batches
 * and this answers the batch.
 */
export async function liveMap(userIds: string[]): Promise<Record<string, { sessionId: string; title: string; viewers: number }>> {
  const ids = [...new Set(userIds.filter(Boolean))].slice(0, 200);
  if (ids.length === 0) return {};
  const rows = await sql`
    SELECT id, host_id, title FROM live_sessions
    WHERE status = 'live' AND host_id = ANY(${ids})
  ` as any[];
  const out: Record<string, { sessionId: string; title: string; viewers: number }> = {};
  for (const r of rows) {
    out[String(r.host_id)] = { sessionId: r.id, title: r.title ?? '', viewers: viewerCount(String(r.id)) };
  }
  return out;
}

/** The host's own live session, if they have one. */
export async function myLive(hostId: string): Promise<LiveSession | null> {
  const [row] = await sql`${SELECT_SESSION} WHERE s.host_id = ${hostId} AND s.status = 'live'` as any[];
  return row ? rowToSession(row) : null;
}
