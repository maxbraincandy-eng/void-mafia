/**
 * ტყუილების ოსტატი (Master of Lies) socket handlers + phase timers.
 * Follows the Spyfall/Alias socket-module pattern.
 */
import { Server, Socket } from 'socket.io';
import {
  ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData, ok, err,
} from './types/index.js';
import {
  createMatch, getMatch, getMatchByCode, listMatches, joinMatch,
  leaveMatch, dissolveMatch, startMatch, submitBluff, clearRejected, submitGuess,
  forcePhaseEnd, nextRound, rematch, disconnectSocket, getSafeState, resumeForUser,
} from './services/liesService.js';
import { emitToPlayers } from './lib/liveSocket.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const ROOM = (id: string) => `lies:${id}`;
function userId(socket: AppSocket): string { return socket.data.profileId ?? socket.id; }

function broadcastState(io: AppServer, matchId: string): void {
  const m = getMatch(matchId);
  if (!m) return;
  // By identity, not by the socket id the player joined with: a reconnected
  // phone has a new socket, and emitting into the old one is how a player ends
  // up frozen mid-round while everyone can still hear them.
  emitToPlayers(io, m.players, 'lies:state', p => getSafeState(m, p.userId), (p, sid) => {
    p.socketId = sid;
    p.connected = true;
  });
}
function broadcastList(io: AppServer): void { io.emit('lies:list_update' as any, listMatches()); }

const phaseTimers = new Map<string, NodeJS.Timeout>();
function clearPhaseTimer(id: string): void { const t = phaseTimers.get(id); if (t) { clearTimeout(t); phaseTimers.delete(id); } }

/** Keep the writing/guessing deadline timer in step with the current phase. */
function syncTimer(io: AppServer, matchId: string): void {
  clearPhaseTimer(matchId);
  const m = getMatch(matchId);
  if (!m || (m.status !== 'writing' && m.status !== 'guessing')) return;
  const token = m.endsAt;
  const t = setTimeout(() => {
    phaseTimers.delete(matchId);
    const cur = getMatch(matchId);
    if (!cur || cur.endsAt !== token) return; // stale
    forcePhaseEnd(matchId);
    broadcastState(io, matchId);
    syncTimer(io, matchId);
  }, Math.max(0, token - Date.now()));
  phaseTimers.set(matchId, t);
}

export function registerLiesHandlers(io: AppServer, socket: AppSocket): void {
  const uid = () => userId(socket);

  socket.on('lies:list' as any, (cb: (r: any) => void) => { try { cb(ok(listMatches())); } catch (e: any) { cb(err(e.message)); } });

  socket.on('lies:create' as any, (data: { nickname?: string; maxPlayers?: number; rounds?: number }, cb: (r: any) => void) => {
    try {
      const nickname = String(data?.nickname ?? 'Host').trim().slice(0, 24) || 'Host';
      const m = createMatch(uid(), socket.id, nickname, { maxPlayers: Number(data?.maxPlayers ?? 8), rounds: Number(data?.rounds ?? 5) });
      socket.join(ROOM(m.id));
      broadcastList(io);
      cb(ok(getSafeState(m, uid())));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('lies:join' as any, (data: { code: string; nickname?: string }, cb: (r: any) => void) => {
    try {
      const code = String(data?.code ?? '').trim().toUpperCase();
      const nickname = String(data?.nickname ?? 'Player').trim().slice(0, 24) || 'Player';
      const m = getMatchByCode(code);
      if (!m) return cb(err('თამაში ვერ მოიძებნა'));
      const result = joinMatch(m.id, uid(), socket.id, nickname);
      if (!result) return cb(err('ვერ შეუერთდი — სავსეა ან უკვე დაწყებულია'));
      socket.join(ROOM(m.id));
      if (result.isNew) broadcastState(io, m.id);
      broadcastList(io);
      cb(ok(getSafeState(result.match, uid())));
    } catch (e: any) { cb(err(e.message)); }
  });

  /**
   * "Am I still in a match, and what is happening in it?"
   *
   * Asked after every (re)authentication, so a dropped connection or a full
   * reload lands the player back in the round instead of on a frozen screen.
   * Returns null when there is nothing to come back to — the client then clears
   * whatever stale match it was still showing.
   */
  socket.on('lies:resume' as any, (cb: (r: any) => void) => {
    try {
      const m = resumeForUser(uid(), socket.id);
      if (!m) return cb(ok(null));
      socket.join(ROOM(m.id));
      broadcastState(io, m.id);   // the table sees them present again
      cb(ok(getSafeState(m, uid())));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('lies:leave' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try {
      const matchId = String(data?.matchId);
      const cur = getMatch(matchId);
      const active = cur && cur.status !== 'waiting' && cur.status !== 'finished';
      // The host walking out closes the table — in the lobby too. A room whose
      // host has left is a room nobody can start, and it was still being
      // advertised as open.
      const close = active || cur?.hostId === uid();
      const m = close ? dissolveMatch(matchId, uid()) : leaveMatch(matchId, uid());
      socket.leave(ROOM(matchId));
      if (m) broadcastState(io, matchId);
      syncTimer(io, matchId);
      broadcastList(io);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('lies:start' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try {
      const matchId = String(data?.matchId);
      const m = startMatch(matchId, uid());
      if (!m) return cb(err('ვერ დაიწყო — საჭიროა მინიმუმ 3 მოთამაშე'));
      broadcastState(io, matchId);
      syncTimer(io, matchId);
      broadcastList(io);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('lies:bluff' as any, (data: { matchId: string; text: string }, cb: (r: any) => void) => {
    try {
      const matchId = String(data?.matchId);
      const res = submitBluff(matchId, uid(), String(data?.text ?? ''));
      if (!res) return cb(err('ვერ გაიგზავნა'));
      broadcastState(io, matchId);
      syncTimer(io, matchId);
      cb(ok({ result: res.result }));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('lies:clear_rejected' as any, (data: { matchId: string }, cb?: (r: any) => void) => {
    try {
      clearRejected(uid());
      broadcastState(io, String(data?.matchId));
      cb?.(ok(null));
    } catch (e: any) { cb?.(err(e.message)); }
  });

  socket.on('lies:guess' as any, (data: { matchId: string; optionId: string }, cb: (r: any) => void) => {
    try {
      const matchId = String(data?.matchId);
      const m = submitGuess(matchId, uid(), String(data?.optionId ?? ''));
      if (!m) return cb(err('ვერ აირჩია'));
      broadcastState(io, matchId);
      syncTimer(io, matchId);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('lies:next' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try {
      const matchId = String(data?.matchId);
      const m = nextRound(matchId, uid());
      if (!m) return cb(err('ვერ გაგრძელდა'));
      broadcastState(io, matchId);
      syncTimer(io, matchId);
      if (m.status === 'finished') broadcastList(io);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('lies:rematch' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try { const m = rematch(String(data?.matchId), uid()); if (!m) return cb(err('ვერ დაიწყო ხელახლა')); broadcastState(io, m.id); broadcastList(io); cb(ok(null)); }
    catch (e: any) { cb(err(e.message)); }
  });
}

// ── Disconnect cleanup ────────────────────────────────────────────────────────
export function handleLiesDisconnect(io: AppServer, socketId: string): void {
  const matchId = disconnectSocket(socketId);
  if (!matchId) return;
  const m = getMatch(matchId);
  if (m) broadcastState(io, matchId);
  syncTimer(io, matchId);
  broadcastList(io);
}
