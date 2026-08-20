/**
 * დახაზე & გამოიცანი socket handlers: phased turn timers (choose → draw →
 * turn-end), live stroke relay, and guess handling. UNO socket-module pattern.
 */
import { Server, Socket } from 'socket.io';
import {
  ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData, ok, err,
} from './types/index.js';
import {
  createMatch, getMatch, getMatchByCode, listMatches, joinMatch, leaveMatch, dissolveMatch,
  startMatch, chooseWord, autoChoose, guess, endTurn, nextTurn, rematch,
  disconnectSocket, getSafeState, addSeg, clearCanvas, resumeForUser, type DrawSeg,
} from './services/drawService.js';
import { emitToPlayers } from './lib/liveSocket.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const ROOM = (id: string) => `draw:${id}`;
function userId(socket: AppSocket): string { return socket.data.profileId ?? socket.id; }

function broadcastState(io: AppServer, matchId: string): void {
  const m = getMatch(matchId);
  if (!m) return;
  // Resolved by identity so a reconnected player keeps receiving state — see
  // lib/liveSocket.
  emitToPlayers(io, m.players, 'draw:state', p => getSafeState(m, p.userId), (p, sid) => {
    p.socketId = sid;
    p.connected = true;
  });
}
function broadcastList(io: AppServer): void { io.emit('draw:list_update' as any, listMatches()); }

const timers = new Map<string, NodeJS.Timeout>();
function clearT(id: string): void { const t = timers.get(id); if (t) { clearTimeout(t); timers.delete(id); } }

/** Schedule the next phase transition off the match's endsAt (token-guarded). */
function schedule(io: AppServer, matchId: string): void {
  clearT(matchId);
  const m = getMatch(matchId);
  if (!m || (m.status !== 'choosing' && m.status !== 'drawing' && m.status !== 'turnend')) return;
  const token = m.endsAt;
  const phase = m.status;
  const t = setTimeout(() => {
    timers.delete(matchId);
    const cur = getMatch(matchId);
    if (!cur || cur.status !== phase || cur.endsAt !== token) return; // stale
    if (phase === 'choosing') { autoChoose(matchId); broadcastState(io, matchId); schedule(io, matchId); }
    else if (phase === 'drawing') { endTurn(matchId); broadcastState(io, matchId); schedule(io, matchId); }
    else if (phase === 'turnend') {
      const nx = nextTurn(matchId);
      broadcastState(io, matchId);
      if (nx && nx.status === 'finished') { clearT(matchId); broadcastList(io); }
      else schedule(io, matchId);
    }
  }, Math.max(0, token - Date.now()));
  timers.set(matchId, t);
}

export function registerDrawHandlers(io: AppServer, socket: AppSocket): void {
  const uid = () => userId(socket);

  socket.on('draw:list' as any, (cb: (r: any) => void) => { try { cb(ok(listMatches())); } catch (e: any) { cb(err(e.message)); } });

  socket.on('draw:create' as any, (data: { nickname?: string; maxPlayers?: number; rounds?: number; drawSeconds?: number }, cb: (r: any) => void) => {
    try {
      const nickname = String(data?.nickname ?? 'Host').trim().slice(0, 24) || 'Host';
      const m = createMatch(uid(), socket.id, nickname, { maxPlayers: Number(data?.maxPlayers ?? 8), rounds: Number(data?.rounds ?? 3), drawSeconds: Number(data?.drawSeconds ?? 70) });
      socket.join(ROOM(m.id)); broadcastList(io); cb(ok(getSafeState(m, uid())));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('draw:join' as any, (data: { code: string; nickname?: string }, cb: (r: any) => void) => {
    try {
      const code = String(data?.code ?? '').trim().toUpperCase();
      const nickname = String(data?.nickname ?? 'Player').trim().slice(0, 24) || 'Player';
      const m = getMatchByCode(code);
      if (!m) return cb(err('Match not found'));
      const result = joinMatch(m.id, uid(), socket.id, nickname);
      if (!result) return cb(err('Cannot join — full or already started'));
      socket.join(ROOM(m.id));
      if (result.isNew) broadcastState(io, m.id);
      broadcastList(io);
      // Send the current canvas so a mid-turn joiner sees the drawing so far.
      if (result.match.status === 'drawing' && result.match.segs.length) socket.emit('draw:canvas' as any, result.match.segs);
      cb(ok(getSafeState(result.match, uid())));
    } catch (e: any) { cb(err(e.message)); }
  });

  /** Back after a drop or a reload — see lies.ts for the reasoning. */
  socket.on('draw:resume' as any, (cb: (r: any) => void) => {
    try {
      const m = resumeForUser(uid(), socket.id);
      if (!m) return cb(ok(null));
      socket.join(ROOM(m.id));
      broadcastState(io, m.id);
      // The strokes so far, or they would come back to an empty canvas.
      if (m.status === 'drawing' && m.segs.length) socket.emit('draw:canvas' as any, m.segs);
      cb(ok(getSafeState(m, uid())));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('draw:leave' as any, (data: { matchId: string }, cb: (r: any) => void) => {
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
      clearT(matchId);
      if (m) { broadcastState(io, matchId); if (!close) schedule(io, matchId); }
      broadcastList(io); cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('draw:start' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try { const m = startMatch(String(data?.matchId), uid()); if (!m) return cb(err('Cannot start — need at least 2 players')); broadcastState(io, m.id); broadcastList(io); schedule(io, m.id); cb(ok(null)); }
    catch (e: any) { cb(err(e.message)); }
  });

  socket.on('draw:choose' as any, (data: { matchId: string; word: string }, cb: (r: any) => void) => {
    try {
      const matchId = String(data?.matchId);
      const m = chooseWord(matchId, uid(), String(data?.word));
      if (!m) return cb(err('Cannot choose'));
      broadcastState(io, matchId); schedule(io, matchId); cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('draw:guess' as any, (data: { matchId: string; text: string }) => {
    try {
      const matchId = String(data?.matchId);
      const r = guess(matchId, uid(), String(data?.text ?? ''));
      if (!r) return;
      if (r.kind === 'correct') {
        io.to(ROOM(matchId)).emit('draw:chat' as any, { system: true, nickname: r.nickname, text: 'გამოიცნო! ✓', ts: Date.now() });
        broadcastState(io, matchId); // scores updated; guesser now sees the word
        if (r.allGuessed) { endTurn(matchId); broadcastState(io, matchId); schedule(io, matchId); }
      } else {
        io.to(ROOM(matchId)).emit('draw:chat' as any, { system: false, nickname: r.nickname, text: r.text, ts: Date.now() });
      }
    } catch { /* ignore */ }
  });

  // Live stroke relay — drawer only. Relay to others, accumulate for late join.
  socket.on('draw:seg' as any, (data: { matchId: string; seg: DrawSeg }) => {
    try {
      const matchId = String(data?.matchId);
      const seg = data?.seg;
      if (!seg) return;
      if (!addSeg(matchId, uid(), seg)) return;
      socket.to(ROOM(matchId)).emit('draw:seg' as any, seg);
    } catch { /* ignore */ }
  });
  socket.on('draw:clear' as any, (data: { matchId: string }) => {
    try { const matchId = String(data?.matchId); if (clearCanvas(matchId, uid())) socket.to(ROOM(matchId)).emit('draw:clear' as any, {}); } catch { /* ignore */ }
  });

  socket.on('draw:rematch' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try { const m = rematch(String(data?.matchId), uid()); if (!m) return cb(err('Cannot rematch')); clearT(m.id); broadcastState(io, m.id); broadcastList(io); cb(ok(null)); }
    catch (e: any) { cb(err(e.message)); }
  });
}

export function handleDrawDisconnect(io: AppServer, socketId: string): void {
  const matchId = disconnectSocket(socketId);
  if (!matchId) return;
  const m = getMatch(matchId);
  if (m) { broadcastState(io, matchId); schedule(io, matchId); }
  broadcastList(io);
}
