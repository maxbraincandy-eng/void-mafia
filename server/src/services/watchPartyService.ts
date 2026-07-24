/**
 * Watch Party — synced co-watching rooms ("კინოს სივრცე").
 *
 * A host opens a room and pastes a link (YouTube, a direct video file, Vimeo,
 * Twitch, TikTok…). Everyone watches together: the host controls playback and
 * the server is the single source of truth for what's playing and where, so
 * play / pause / seek / speed stay in sync and late joiners jump to the current
 * moment. Voice + chat come from the shared LiveKit room on the client; only
 * room + playback state lives here.
 *
 * Built standalone (no reuse of any other game engine). Follows the
 * lies/spyfall/sxvaMafia socket-module conventions.
 */
import { generateId } from '../utils/helpers.js';

// Which providers can we actually drive (play/pause/seek) from our own page?
//  - youtube : YouTube IFrame Player API  → full control
//  - video   : direct file (mp4/webm/hls) → HTML5 <video> full control
//  - vimeo   : Vimeo Player SDK           → full control
//  - twitch  : Twitch embed               → display only (no reliable seek sync)
//  - tiktok  : TikTok embed               → display only
//  - embed   : unknown site               → best-effort iframe, display only
export type WpProvider = 'youtube' | 'video' | 'vimeo' | 'twitch' | 'tiktok' | 'embed';

export interface WpSource {
  raw: string;         // original url the host pasted
  provider: WpProvider;
  refId: string;       // youtube/vimeo id, twitch channel|video id, or the url for `video`/`embed`
  title: string;       // best-effort display title
  synced: boolean;     // true when we can keep everyone in lockstep
}

export interface WpMember {
  userId: string;
  socketId: string;
  name: string;
  avatar: string;
  joinedAt: number;
}

export interface WpChatMsg {
  id: string;
  userId: string;
  name: string;
  text: string;
  at: number;
}

export interface WpMatch {
  id: string;
  code: string;
  hostId: string;
  hostSocketId: string;
  hostName: string;
  title: string;
  createdAt: number;
  members: WpMember[];     // includes the host
  source: WpSource | null;
  queue: WpSource[];
  playing: boolean;
  positionSec: number;     // authoritative position captured at `updatedAt`
  updatedAt: number;       // server ms when playing/position was last set
  rate: number;            // playback rate (1 = normal)
  chat: WpChatMsg[];
}

export interface WpListItem {
  id: string;
  code: string;
  hostName: string;
  title: string;
  memberCount: number;
  nowPlaying: string | null;
  provider: WpProvider | null;
  createdAt: number;
}

const matches = new Map<string, WpMatch>();
const codes = new Map<string, string>(); // code → matchId
const MAX_CHAT = 120;

function genCode(): string {
  // 4-char human-friendly join code (avoid ambiguous chars).
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  } while (codes.has(code));
  return code;
}

// ── URL / provider parsing ────────────────────────────────────────────
const YT_RE = [
  /youtu\.be\/([\w-]{6,})/i,
  /youtube\.com\/watch\?[^#]*\bv=([\w-]{6,})/i,
  /youtube\.com\/embed\/([\w-]{6,})/i,
  /youtube\.com\/shorts\/([\w-]{6,})/i,
  /youtube\.com\/live\/([\w-]{6,})/i,
];
const VIMEO_RE = /vimeo\.com\/(?:video\/)?(\d{5,})/i;
const TWITCH_VIDEO_RE = /twitch\.tv\/videos\/(\d{5,})/i;
const TWITCH_CHANNEL_RE = /twitch\.tv\/([A-Za-z0-9_]{3,25})(?:$|[/?#])/i;
const TIKTOK_RE = /tiktok\.com\/@[\w.-]+\/video\/(\d{6,})/i;
const VIDEO_EXT_RE = /\.(mp4|webm|ogg|ogv|mov|m4v|m3u8|mpd)(\?|#|$)/i;

export function parseSource(rawInput: string): WpSource | null {
  const raw = (rawInput ?? '').trim();
  if (!raw) return null;
  // Require an http(s) URL to avoid javascript:/data: and other schemes.
  let url: URL;
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const href = url.href;

  for (const re of YT_RE) {
    const m = href.match(re);
    if (m) return { raw: href, provider: 'youtube', refId: m[1], title: 'YouTube video', synced: true };
  }
  const vm = href.match(VIMEO_RE);
  if (vm) return { raw: href, provider: 'vimeo', refId: vm[1], title: 'Vimeo video', synced: true };

  if (VIDEO_EXT_RE.test(url.pathname) || VIDEO_EXT_RE.test(href)) {
    const name = decodeURIComponent(url.pathname.split('/').pop() || 'Video');
    return { raw: href, provider: 'video', refId: href, title: name, synced: true };
  }

  const tv = href.match(TWITCH_VIDEO_RE);
  if (tv) return { raw: href, provider: 'twitch', refId: `video:${tv[1]}`, title: 'Twitch video', synced: false };
  const tc = href.match(TWITCH_CHANNEL_RE);
  if (tc && !/\/(videos|directory|settings)\b/i.test(url.pathname)) {
    return { raw: href, provider: 'twitch', refId: `channel:${tc[1]}`, title: `Twitch · ${tc[1]}`, synced: false };
  }
  const tk = href.match(TIKTOK_RE);
  if (tk) return { raw: href, provider: 'tiktok', refId: tk[1], title: 'TikTok', synced: false };

  // Unknown site — best-effort iframe. Most block embedding, but let the client try.
  return { raw: href, provider: 'embed', refId: href, title: url.hostname.replace(/^www\./, ''), synced: false };
}

// ── Lifecycle ─────────────────────────────────────────────────────────
export function createMatch(
  hostId: string, socketId: string, name: string, avatar: string, title: string,
): WpMatch {
  const id = generateId();
  const code = genCode();
  const now = Date.now();
  const host: WpMember = { userId: hostId, socketId, name, avatar, joinedAt: now };
  const m: WpMatch = {
    id, code,
    hostId, hostSocketId: socketId, hostName: name,
    title: (title || `${name}'s room`).slice(0, 60),
    createdAt: now,
    members: [host],
    source: null,
    queue: [],
    playing: false,
    positionSec: 0,
    updatedAt: now,
    rate: 1,
    chat: [],
  };
  matches.set(id, m);
  codes.set(code, id);
  return m;
}

export function getMatch(id: string): WpMatch | undefined { return matches.get(id); }
export function getMatchByCode(code: string): WpMatch | undefined {
  const id = codes.get((code ?? '').toUpperCase().trim());
  return id ? matches.get(id) : undefined;
}

export function listMatches(): WpListItem[] {
  return [...matches.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(m => ({
      id: m.id, code: m.code, hostName: m.hostName, title: m.title,
      memberCount: m.members.length,
      nowPlaying: m.source?.title ?? null,
      provider: m.source?.provider ?? null,
      createdAt: m.createdAt,
    }));
}

export function joinMatch(
  id: string, userId: string, socketId: string, name: string, avatar: string,
): WpMatch | null {
  const m = matches.get(id);
  if (!m) return null;
  const existing = m.members.find(x => x.userId === userId);
  if (existing) {
    existing.socketId = socketId;   // reconnect
    existing.name = name;
    existing.avatar = avatar;
    if (userId === m.hostId) m.hostSocketId = socketId;
  } else {
    m.members.push({ userId, socketId, name, avatar, joinedAt: Date.now() });
  }
  return m;
}

/** Remove a member. Reassigns host if the host left; dissolves an empty room. */
export function leaveMatch(id: string, userId: string): { dissolved: boolean } {
  const m = matches.get(id);
  if (!m) return { dissolved: false };
  m.members = m.members.filter(x => x.userId !== userId);
  if (m.members.length === 0) { dissolve(id); return { dissolved: true }; }
  if (userId === m.hostId) {
    const next = m.members[0];
    m.hostId = next.userId;
    m.hostSocketId = next.socketId;
    m.hostName = next.name;
  }
  return { dissolved: false };
}

export function dissolve(id: string): void {
  const m = matches.get(id);
  if (!m) return;
  codes.delete(m.code);
  matches.delete(id);
}

export function transferHost(id: string, hostId: string, targetUserId: string): WpMatch | null {
  const m = matches.get(id);
  if (!m || m.hostId !== hostId) return null;
  const target = m.members.find(x => x.userId === targetUserId);
  if (!target) return null;
  m.hostId = target.userId;
  m.hostSocketId = target.socketId;
  m.hostName = target.name;
  return m;
}

/** Find a room by any member's socket (for disconnect handling). */
export function findBySocket(socketId: string): WpMatch | undefined {
  for (const m of matches.values()) {
    if (m.members.some(x => x.socketId === socketId)) return m;
  }
  return undefined;
}

// ── Playback (host-driven; server is source of truth) ─────────────────
/** Current playback position in seconds, extrapolated from the last update. */
export function effectivePosition(m: WpMatch): number {
  if (!m.playing) return m.positionSec;
  const elapsed = (Date.now() - m.updatedAt) / 1000;
  return m.positionSec + elapsed * m.rate;
}

function capture(m: WpMatch, positionSec: number, playing: boolean): void {
  m.positionSec = Math.max(0, positionSec);
  m.playing = playing;
  m.updatedAt = Date.now();
}

export function setSource(id: string, hostId: string, rawUrl: string): WpMatch | null {
  const m = matches.get(id);
  if (!m || m.hostId !== hostId) return null;
  const src = parseSource(rawUrl);
  if (!src) return null;
  m.source = src;
  capture(m, 0, src.synced); // synced sources autoplay; embed-only starts "paused" (no control)
  return m;
}

export function play(id: string, hostId: string, positionSec?: number): WpMatch | null {
  const m = matches.get(id);
  if (!m || m.hostId !== hostId) return null;
  capture(m, positionSec ?? effectivePosition(m), true);
  return m;
}

export function pause(id: string, hostId: string, positionSec?: number): WpMatch | null {
  const m = matches.get(id);
  if (!m || m.hostId !== hostId) return null;
  capture(m, positionSec ?? effectivePosition(m), false);
  return m;
}

export function seek(id: string, hostId: string, positionSec: number): WpMatch | null {
  const m = matches.get(id);
  if (!m || m.hostId !== hostId) return null;
  if (!Number.isFinite(positionSec)) return null;
  capture(m, positionSec, m.playing);
  return m;
}

export function setRate(id: string, hostId: string, rate: number): WpMatch | null {
  const m = matches.get(id);
  if (!m || m.hostId !== hostId) return null;
  const r = Math.min(4, Math.max(0.25, Number(rate) || 1));
  // Re-capture position at the old rate before switching so extrapolation stays correct.
  capture(m, effectivePosition(m), m.playing);
  m.rate = r;
  return m;
}

// ── Queue ─────────────────────────────────────────────────────────────
export function queueAdd(id: string, hostId: string, rawUrl: string): WpMatch | null {
  const m = matches.get(id);
  if (!m || m.hostId !== hostId) return null;
  const src = parseSource(rawUrl);
  if (!src) return null;
  if (m.queue.length >= 50) return null;
  // If nothing is playing yet, load it straight away instead of queueing.
  if (!m.source) { m.source = src; capture(m, 0, src.synced); return m; }
  m.queue.push(src);
  return m;
}

export function queueRemove(id: string, hostId: string, index: number): WpMatch | null {
  const m = matches.get(id);
  if (!m || m.hostId !== hostId) return null;
  if (index < 0 || index >= m.queue.length) return null;
  m.queue.splice(index, 1);
  return m;
}

export function queueNext(id: string, hostId: string): WpMatch | null {
  const m = matches.get(id);
  if (!m || m.hostId !== hostId) return null;
  const next = m.queue.shift();
  m.source = next ?? null;
  capture(m, 0, next ? next.synced : false);
  return m;
}

// ── Chat ──────────────────────────────────────────────────────────────
export function addChat(id: string, userId: string, text: string): { m: WpMatch; msg: WpChatMsg } | null {
  const m = matches.get(id);
  if (!m) return null;
  const member = m.members.find(x => x.userId === userId);
  if (!member) return null;
  const clean = (text ?? '').toString().slice(0, 500).trim();
  if (!clean) return null;
  const msg: WpChatMsg = { id: generateId(), userId, name: member.name, text: clean, at: Date.now() };
  m.chat.push(msg);
  if (m.chat.length > MAX_CHAT) m.chat.splice(0, m.chat.length - MAX_CHAT);
  return { m, msg };
}

// ── Safe state (broadcast) ────────────────────────────────────────────
export interface WpSafeState {
  id: string;
  code: string;
  title: string;
  hostId: string;
  hostName: string;
  you: { userId: string; isHost: boolean };
  members: Array<{ userId: string; name: string; avatar: string; isHost: boolean }>;
  source: WpSource | null;
  queue: WpSource[];
  playing: boolean;
  positionSec: number;   // effective position AT the moment of this snapshot
  rate: number;
  serverTime: number;    // so the client can account for network latency
  chat: WpChatMsg[];
}

export function getSafeState(m: WpMatch, viewerUserId: string): WpSafeState {
  return {
    id: m.id,
    code: m.code,
    title: m.title,
    hostId: m.hostId,
    hostName: m.hostName,
    you: { userId: viewerUserId, isHost: viewerUserId === m.hostId },
    members: m.members.map(x => ({ userId: x.userId, name: x.name, avatar: x.avatar, isHost: x.userId === m.hostId })),
    source: m.source,
    queue: m.queue,
    playing: m.playing,
    positionSec: effectivePosition(m),
    rate: m.rate,
    serverTime: Date.now(),
    chat: m.chat,
  };
}
