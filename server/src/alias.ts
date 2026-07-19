/**
 * ალიასი socket handlers + turn timer. Follows the UNO socket-module pattern.
 */
import { Server, Socket } from 'socket.io';
import {
  ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData, ok, err,
} from './types/index.js';
import {
  createMatch, getMatch, getMatchByCode, listMatches, joinMatch, switchTeam,
  leaveMatch, startMatch, startTurn, markWord, endTurn, rematch, disconnectSocket, getSafeState,
} from './services/aliasService.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const ROOM = (id: string) => `alias:${id}`;
function userId(socket: AppSocket): string { return socket.data.profileId ?? socket.id; }

function broadcastState(io: AppServer, matchId: string): void {
  const m = getMatch(matchId);
  if (!m) return;
  for (const player of m.players) {
    const s = io.sockets.sockets.get(player.socketId);
    if (s) s.emit('alias:state' as any, getSafeState(m, player.userId));
  }
}
function broadcastList(io: AppServer): void { io.emit('alias:list_update' as any, listMatches()); }

const turnTimers = new Map<string, NodeJS.Timeout>();
function clearTurnTimer(id: string): void { const t = turnTimers.get(id); if (t) { clearTimeout(t); turnTimers.delete(id); } }

function scheduleTurnEnd(io: AppServer, matchId: string): void {
  clearTurnTimer(matchId);
  const m = getMatch(matchId);
  if (!m || m.status !== 'play' || !m.turn) return;
  const token = m.turn.endsAt;
  const t = setTimeout(() => {
    turnTimers.delete(matchId);
    const cur = getMatch(matchId);
    if (!cur || cur.status !== 'play' || cur.turn?.endsAt !== token) return; // stale
    endTurn(matchId);
    broadcastState(io, matchId);
  }, Math.max(0, token - Date.now()));
  turnTimers.set(matchId, t);
}

export function registerAliasHandlers(io: AppServer, socket: AppSocket): void {
  const uid = () => userId(socket);

  socket.on('alias:list' as any, (cb: (r: any) => void) => { try { cb(ok(listMatches())); } catch (e: any) { cb(err(e.message)); } });

  socket.on('alias:create' as any, (data: { nickname?: string; maxPlayers?: number; targetScore?: number; roundSeconds?: number }, cb: (r: any) => void) => {
    try {
      const nickname = String(data?.nickname ?? 'Host').trim().slice(0, 24) || 'Host';
      const m = createMatch(uid(), socket.id, nickname, { maxPlayers: Number(data?.maxPlayers ?? 8), targetScore: Number(data?.targetScore ?? 30), roundSeconds: Number(data?.roundSeconds ?? 60) });
      socket.join(ROOM(m.id));
      broadcastList(io);
      cb(ok(getSafeState(m, uid())));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('alias:join' as any, (data: { code: string; nickname?: string }, cb: (r: any) => void) => {
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
      cb(ok(getSafeState(result.match, uid())));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('alias:switch_team' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try { const m = switchTeam(String(data?.matchId), uid()); if (!m) return cb(err('Cannot switch')); broadcastState(io, m.id); cb(ok(null)); }
    catch (e: any) { cb(err(e.message)); }
  });

  socket.on('alias:leave' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try {
      const matchId = String(data?.matchId);
      const m = leaveMatch(matchId, uid());
      socket.leave(ROOM(matchId));
      if (m) { broadcastState(io, matchId); if (m.turn) scheduleTurnEnd(io, matchId); } else clearTurnTimer(matchId);
      broadcastList(io);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('alias:start' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try { const m = startMatch(String(data?.matchId), uid()); if (!m) return cb(err('Cannot start — need at least 1 player per team')); broadcastState(io, m.id); broadcastList(io); cb(ok(null)); }
    catch (e: any) { cb(err(e.message)); }
  });

  socket.on('alias:start_turn' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try {
      const matchId = String(data?.matchId);
      const m = startTurn(matchId, uid());
      if (!m) return cb(err('Not your turn'));
      broadcastState(io, matchId);
      scheduleTurnEnd(io, matchId);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('alias:mark' as any, (data: { matchId: string; got: boolean }, cb: (r: any) => void) => {
    try {
      const matchId = String(data?.matchId);
      const m = markWord(matchId, uid(), !!data?.got);
      if (!m) return cb(err('Cannot mark'));
      broadcastState(io, matchId);
      if (m.status === 'finished') { clearTurnTimer(matchId); broadcastList(io); }
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('alias:rematch' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try { const m = rematch(String(data?.matchId), uid()); if (!m) return cb(err('Cannot rematch')); broadcastState(io, m.id); broadcastList(io); cb(ok(null)); }
    catch (e: any) { cb(err(e.message)); }
  });

  // Simple in-game guess chat (guessers shout here if not on voice).
  socket.on('alias:guess' as any, (data: { matchId: string; text: string; nickname: string }) => {
    try {
      const m = getMatch(String(data?.matchId));
      if (!m) return;
      const p = m.players.find(pl => pl.userId === uid());
      if (!p) return;
      const text = String(data?.text ?? '').trim().slice(0, 60);
      if (!text) return;
      io.to(ROOM(m.id)).emit('alias:guess' as any, { nickname: p.nickname, team: p.team, text, ts: Date.now() });
    } catch { /* ignore */ }
  });
}

export function handleAliasDisconnect(io: AppServer, socketId: string): void {
  const matchId = disconnectSocket(socketId);
  if (!matchId) return;
  const m = getMatch(matchId);
  if (m) broadcastState(io, matchId);
  broadcastList(io);
}
