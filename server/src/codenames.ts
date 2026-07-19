/**
 * Codenames socket handlers (untimed). UNO socket-module pattern. State is
 * per-viewer: only spymasters see the colour key.
 */
import { Server, Socket } from 'socket.io';
import {
  ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData, ok, err,
} from './types/index.js';
import {
  createMatch, getMatch, getMatchByCode, listMatches, joinMatch, switchTeam, setSpymaster,
  leaveMatch, dissolveMatch, startMatch, giveClue, guessCard, passTurn, rematch, disconnectSocket, getSafeState,
} from './services/codenamesService.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const ROOM = (id: string) => `cn:${id}`;
function userId(socket: AppSocket): string { return socket.data.profileId ?? socket.id; }

function broadcastState(io: AppServer, matchId: string): void {
  const m = getMatch(matchId);
  if (!m) return;
  for (const player of m.players) {
    const s = io.sockets.sockets.get(player.socketId);
    if (s) s.emit('cn:state' as any, getSafeState(m, player.userId));
  }
}
function broadcastList(io: AppServer): void { io.emit('cn:list_update' as any, listMatches()); }

export function registerCodenamesHandlers(io: AppServer, socket: AppSocket): void {
  const uid = () => userId(socket);

  socket.on('cn:list' as any, (cb: (r: any) => void) => { try { cb(ok(listMatches())); } catch (e: any) { cb(err(e.message)); } });

  socket.on('cn:create' as any, (data: { nickname?: string; maxPlayers?: number }, cb: (r: any) => void) => {
    try {
      const nickname = String(data?.nickname ?? 'Host').trim().slice(0, 24) || 'Host';
      const m = createMatch(uid(), socket.id, nickname, { maxPlayers: Number(data?.maxPlayers ?? 8) });
      socket.join(ROOM(m.id)); broadcastList(io); cb(ok(getSafeState(m, uid())));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('cn:join' as any, (data: { code: string; nickname?: string }, cb: (r: any) => void) => {
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

  const simple = (event: string, fn: (matchId: string, uid: string) => any, failMsg: string) =>
    socket.on(event as any, (data: { matchId: string }, cb: (r: any) => void) => {
      try { const m = fn(String(data?.matchId), uid()); if (!m) return cb(err(failMsg)); broadcastState(io, m.id); broadcastList(io); cb(ok(null)); }
      catch (e: any) { cb(err(e.message)); }
    });

  simple('cn:switch_team', switchTeam, 'Cannot switch');
  simple('cn:spymaster', setSpymaster, 'Cannot set spymaster');
  simple('cn:start', startMatch, 'Cannot start — each team needs a spymaster + operative');
  simple('cn:pass', passTurn, 'Cannot pass');
  simple('cn:rematch', rematch, 'Cannot rematch');

  socket.on('cn:leave' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try {
      const matchId = String(data?.matchId);
      const cur = getMatch(matchId);
      const active = cur && cur.status !== 'waiting' && cur.status !== 'finished';
      const m = active ? dissolveMatch(matchId, uid()) : leaveMatch(matchId, uid());
      socket.leave(ROOM(matchId));
      if (m) broadcastState(io, matchId);
      broadcastList(io); cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('cn:clue' as any, (data: { matchId: string; word: string; number: number }, cb: (r: any) => void) => {
    try {
      const m = giveClue(String(data?.matchId), uid(), String(data?.word), Number(data?.number));
      if (!m) return cb(err('Cannot give clue'));
      broadcastState(io, m.id); cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('cn:guess' as any, (data: { matchId: string; index: number }, cb: (r: any) => void) => {
    try {
      const matchId = String(data?.matchId);
      const m = guessCard(matchId, uid(), Number(data?.index));
      if (!m) return cb(err('Cannot guess'));
      broadcastState(io, matchId);
      if (m.status === 'finished') broadcastList(io);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });
}

export function handleCodenamesDisconnect(io: AppServer, socketId: string): void {
  const matchId = disconnectSocket(socketId);
  if (!matchId) return;
  const m = getMatch(matchId);
  if (m) broadcastState(io, matchId);
  broadcastList(io);
}
