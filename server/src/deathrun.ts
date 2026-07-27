/**
 * Deathrun socket handlers + phase timers.
 *
 * Movement is relayed at the rate clients send it (never echoed back to the
 * sender) and deliberately does NOT go through the state broadcast — the state
 * is the round/scoreboard, the position stream is its own high-frequency
 * channel, exactly like the 3D worlds.
 *
 * Follows the blackout socket-module conventions, including token-guarded
 * timers so a stale timeout can never advance a phase that has already moved on.
 */
import { Server, Socket } from 'socket.io';
import {
  ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData, ok, err,
} from './types/index.js';
import {
  createMatch, getMatch, getMatchByCode, listMatches, matchOfPlayer,
  joinMatch, leaveMatch, disconnectSocket, getState,
  startRound, beginRun, fireTrap, reportDeath, reportFinish, runOver, toDuel,
  swordHit, duelResult, endRound, resetToLobby, move,
  OVER_MS,
} from './services/deathrunService.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const ROOM = (id: string) => `deathrun:${id}`;
const userId = (s: AppSocket) => s.data.profileId ?? s.id;

function broadcast(io: AppServer, matchId: string): void {
  const m = getMatch(matchId);
  if (!m) return;
  io.to(ROOM(matchId)).emit('deathrun:state' as any, getState(m));
}
function broadcastList(io: AppServer): void {
  io.emit('deathrun:list_update' as any, listMatches());
}

// ── phase timers ──────────────────────────────────────────────────────
const timers = new Map<string, NodeJS.Timeout>();
function clearPhase(matchId: string) {
  const t = timers.get(matchId);
  if (t) { clearTimeout(t); timers.delete(matchId); }
}
/** Schedule the end of the current phase, guarded by its deadline as a token. */
function schedulePhase(io: AppServer, matchId: string): void {
  clearPhase(matchId);
  const m = getMatch(matchId);
  if (!m || !m.phaseEndsAt) return;
  const token = m.phaseEndsAt, status = m.status;
  const t = setTimeout(() => {
    timers.delete(matchId);
    const cur = getMatch(matchId);
    if (!cur || cur.phaseEndsAt !== token || cur.status !== status) return;   // stale
    advance(io, matchId);
  }, Math.max(0, token - Date.now()));
  timers.set(matchId, t);
}

/** The phase deadline expired — move the round on. */
function advance(io: AppServer, matchId: string): void {
  const m = getMatch(matchId);
  if (!m) return;
  if (m.status === 'countdown') {
    beginRun(m);
  } else if (m.status === 'running') {
    // time is up: anyone still on the course is out of it
    for (const p of m.players) if (p.role === 'runner' && p.alive && !p.finished) p.alive = false;
    if (!toDuel(m)) { /* endRound already ran inside toDuel */ }
  } else if (m.status === 'duel') {
    // nobody landed the last hit — the Death holds the arena
    endRound(m, 'death', 'დრო ამოიწურა');
  } else if (m.status === 'over') {
    resetToLobby(m);
    broadcast(io, matchId);
    broadcastList(io);
    return;                                   // waiting has no deadline
  }
  broadcast(io, matchId);
  schedulePhase(io, matchId);
}

/** After any event that can resolve a phase early. */
function checkProgress(io: AppServer, matchId: string): void {
  const m = getMatch(matchId);
  if (!m) return;
  if (m.status === 'running' && runOver(m)) {
    toDuel(m);
    broadcast(io, matchId);
    schedulePhase(io, matchId);
    return;
  }
  if (m.status === 'duel') {
    const r = duelResult(m);
    if (r) {
      endRound(m, r, r === 'death' ? 'სიკვდილმა ყველა დაამარცხა' : 'მორბენლებმა სძლიეს');
      broadcast(io, matchId);
      schedulePhase(io, matchId);
      return;
    }
  }
  broadcast(io, matchId);
}

export function registerDeathrunHandlers(io: AppServer, socket: AppSocket): void {
  const uid = () => userId(socket);

  socket.on('deathrun:list' as any, (cb: (r: any) => void) => {
    try { cb(ok(listMatches())); } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('deathrun:create' as any, (data: { nickname?: string; maxPlayers?: number }, cb: (r: any) => void) => {
    try {
      const nickname = String(data?.nickname ?? 'Host').trim().slice(0, 24) || 'Host';
      const m = createMatch(uid(), socket.id, nickname, { maxPlayers: Number(data?.maxPlayers ?? 10) });
      socket.join(ROOM(m.id));
      broadcastList(io);
      cb(ok(getState(m)));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('deathrun:join' as any, (data: { code?: string; matchId?: string; nickname?: string }, cb: (r: any) => void) => {
    try {
      const nickname = String(data?.nickname ?? 'Player').trim().slice(0, 24) || 'Player';
      const m = data?.matchId ? getMatch(String(data.matchId)) : getMatchByCode(String(data?.code ?? ''));
      if (!m) return cb(err('ოთახი ვერ მოიძებნა'));
      const r = joinMatch(m.id, uid(), socket.id, nickname);
      if (!r) return cb(err('ოთახი სავსეა'));
      socket.join(ROOM(m.id));
      if (r.isNew) broadcast(io, m.id);
      broadcastList(io);
      cb(ok(getState(r.match)));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('deathrun:leave' as any, (data: { matchId: string }, cb?: (r: any) => void) => {
    try {
      const matchId = String(data?.matchId);
      const m = leaveMatch(matchId, uid());
      socket.leave(ROOM(matchId));
      if (m) { broadcast(io, matchId); schedulePhase(io, matchId); } else clearPhase(matchId);
      broadcastList(io);
      cb?.(ok(null));
    } catch (e: any) { cb?.(err(e.message)); }
  });

  socket.on('deathrun:start' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try {
      const m = getMatch(String(data?.matchId));
      if (!m) return cb(err('ოთახი ვერ მოიძებნა'));
      if (m.hostId !== uid()) return cb(err('მხოლოდ ჰოსტს შეუძლია'));
      if (m.status !== 'waiting' && m.status !== 'over') return cb(err('რაუნდი უკვე მიმდინარეობს'));
      if (!startRound(m)) return cb(err('საჭიროა მინიმუმ 2 მოთამაშე'));
      broadcast(io, m.id);
      broadcastList(io);
      schedulePhase(io, m.id);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── the Death pulls a lever ──
  socket.on('deathrun:trap' as any, (data: { matchId: string; trapId: string; cooldown?: number }, cb?: (r: any) => void) => {
    try {
      const m = getMatch(String(data?.matchId));
      if (!m) return cb?.(err('ოთახი ვერ მოიძებნა'));
      const r = fireTrap(m, uid(), String(data?.trapId), Number(data?.cooldown ?? 6000));
      if (!r.ok) return cb?.(err(r.error));
      // everyone replays the same keyframes from this timestamp
      io.to(ROOM(m.id)).emit('deathrun:trap_fired' as any, { trapId: String(data.trapId), at: r.at });
      broadcast(io, m.id);
      cb?.(ok(null));
    } catch (e: any) { cb?.(err(e.message)); }
  });

  // ── a client reports its own death / finish ──
  socket.on('deathrun:died' as any, (data: { matchId: string; cause?: string }) => {
    const m = getMatch(String(data?.matchId));
    if (!m) return;
    reportDeath(m, uid(), String(data?.cause ?? 'trap'));
    checkProgress(io, m.id);
  });

  socket.on('deathrun:finish' as any, (data: { matchId: string }, cb?: (r: any) => void) => {
    const m = getMatch(String(data?.matchId));
    if (!m) return cb?.(err('ოთახი ვერ მოიძებნა'));
    const time = reportFinish(m, uid());
    checkProgress(io, m.id);
    cb?.(ok({ time }));
  });

  // ── sword duel ──
  socket.on('deathrun:hit' as any, (data: { matchId: string; victimId: string }, cb?: (r: any) => void) => {
    const m = getMatch(String(data?.matchId));
    if (!m) return cb?.(err('ოთახი ვერ მოიძებნა'));
    const r = swordHit(m, uid(), String(data?.victimId));
    if (!r) return cb?.(err('ვერ მოხვდა'));
    io.to(ROOM(m.id)).emit('deathrun:hit_landed' as any, { by: uid(), victim: r.victim.userId, hp: r.victim.hp, dead: r.dead });
    checkProgress(io, m.id);
    cb?.(ok({ dead: r.dead, hp: r.victim.hp }));
  });

  socket.on('deathrun:swing' as any, (data: { matchId: string }) => {
    const m = getMatch(String(data?.matchId));
    if (!m) return;
    socket.to(ROOM(m.id)).emit('deathrun:swung' as any, { userId: uid() });
  });

  // ── position stream: relayed to the room, never echoed back ──
  socket.on('deathrun:move' as any, (data: { matchId: string; x: number; y: number; z: number; ry: number }) => {
    const m = getMatch(String(data?.matchId));
    if (!m) return;
    move(m, uid(), Number(data?.x), Number(data?.y), Number(data?.z), Number(data?.ry));
    socket.to(ROOM(m.id)).emit('deathrun:moved' as any, {
      userId: uid(), x: Number(data?.x), y: Number(data?.y), z: Number(data?.z), ry: Number(data?.ry),
    });
  });

  socket.on('deathrun:state' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    const m = getMatch(String(data?.matchId));
    cb(m ? ok(getState(m)) : err('ოთახი ვერ მოიძებნა'));
  });

  socket.on('disconnect', () => {
    const matchId = disconnectSocket(socket.id);
    if (!matchId) return;
    const m = getMatch(matchId);
    if (!m) return;
    // a disconnect can be the last runner standing
    if (m.status === 'running' || m.status === 'duel') checkProgress(io, matchId);
    else broadcast(io, matchId);
    broadcastList(io);
  });
}

/** Re-arm timers for a match the caller knows is mid-phase (used on rejoin). */
export function resumeDeathrunTimers(io: AppServer, matchId: string): void {
  const m = getMatch(matchId);
  if (m && m.phaseEndsAt) schedulePhase(io, matchId);
}

export { OVER_MS };
