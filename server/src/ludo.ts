/**
 * Ludo mini-game socket handlers.
 * Completely separate from Mafia rooms and other mini-games.
 */
import { Server, Socket } from 'socket.io';
import {
  ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData,
  ok, err,
} from './types/index.js';
import {
  createMatch, getMatch, getMatchByCode, getMatchForSocket, getOpenMatches,
  joinMatch, doRoll, doMove, doResign, doRematch, doLeave, addChat, cleanupSocket,
  type LudoMatch, type LudoColor,
} from './services/ludoService.js';
import { addXP } from './services/playerService.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const LUDO_ROOM = (id: string) => `ld:${id}`;

function toPublic(match: LudoMatch) {
  return {
    id: match.id,
    code: match.code,
    status: match.status,
    red: {
      name: match.red.name,
      profileId: match.red.profileId,
      socketId: match.red.socketId,
      pieces: match.red.pieces,
    },
    blue: match.blue ? {
      name: match.blue.name,
      profileId: match.blue.profileId,
      socketId: match.blue.socketId,
      pieces: match.blue.pieces,
    } : null,
    currentTurn: match.currentTurn,
    diceRoll: match.diceRoll,
    diceRolled: match.diceRolled,
    movablePieceIds: match.movablePieceIds,
    consecutiveSixes: match.consecutiveSixes,
    winnerColor: match.winnerColor,
    chat: match.chat.slice(-80),
    spectatorCount: match.spectatorSocketIds.length,
  };
}

function toListItem(match: LudoMatch) {
  return {
    id: match.id,
    code: match.code,
    status: match.status,
    redName: match.red.name,
    blueName: match.blue?.name ?? null,
    spectatorCount: match.spectatorSocketIds.length,
    createdAt: match.createdAt,
  };
}

function broadcastState(io: AppServer, match: LudoMatch): void {
  io.to(LUDO_ROOM(match.id)).emit('ludo:state' as any, toPublic(match));
}

function broadcastList(io: AppServer): void {
  io.emit('ludo:list_update' as any, getOpenMatches().map(toListItem));
}

// ── Handler Registration ───────────────────────────────────────────────
export function registerLudoHandlers(io: AppServer, socket: AppSocket): void {

  socket.on('ludo:list' as any, (cb: (res: any) => void) => {
    try {
      cb(ok(getOpenMatches().map(toListItem)));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('ludo:create' as any, (data: { name: string }, cb: (res: any) => void) => {
    try {
      const name = String(data?.name ?? 'Player').trim().slice(0, 24) || 'Player';
      const existing = getMatchForSocket(socket.id);
      if (existing && existing.status !== 'finished') {
        return cb(err('You are already in a Ludo match.'));
      }
      const match = createMatch({ socketId: socket.id, name, profileId: socket.data.profileId ?? null });
      socket.join(LUDO_ROOM(match.id));
      broadcastList(io);
      cb(ok(toPublic(match)));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('ludo:join' as any, (data: { code: string; name: string }, cb: (res: any) => void) => {
    try {
      const name = String(data?.name ?? 'Player').trim().slice(0, 24) || 'Player';
      const match = getMatchByCode(data.code ?? '');
      if (!match) return cb(err('Match not found.'));
      if (match.status === 'finished') return cb(err('This match has ended.'));

      // Re-join own match
      if (match.red.socketId === socket.id || match.blue?.socketId === socket.id) {
        socket.join(LUDO_ROOM(match.id));
        return cb(ok(toPublic(match)));
      }

      const existing = getMatchForSocket(socket.id);
      if (existing && existing.id !== match.id && existing.status !== 'finished') {
        return cb(err('You are already in another Ludo match.'));
      }

      const { role } = joinMatch(match.id, { socketId: socket.id, name, profileId: socket.data.profileId ?? null });
      socket.join(LUDO_ROOM(match.id));

      if (role === 'blue') {
        broadcastState(io, match);
        broadcastList(io);
      }

      cb(ok(toPublic(match)));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('ludo:roll' as any, (data: { matchId: string }, cb: (res: any) => void) => {
    try {
      const result = doRoll(data.matchId, socket.id);
      const match = getMatch(data.matchId);
      if (!match) return cb(err('Match not found.'));
      broadcastState(io, match);
      cb(ok(result));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('ludo:move' as any, (data: { matchId: string; pieceId: number }, cb: (res: any) => void) => {
    try {
      const result = doMove(data.matchId, socket.id, data.pieceId);
      const match = getMatch(data.matchId);
      if (!match) return cb(err('Match not found.'));

      if (result.winnerColor) {
        const winner = result.winnerColor === 'red' ? match.red : match.blue;
        const loser  = result.winnerColor === 'red' ? match.blue : match.red;
        if (winner?.profileId) addXP(winner.profileId, 25).catch(() => {});
        if (loser?.profileId)  addXP(loser.profileId, 8).catch(() => {});
        broadcastList(io);
      }

      broadcastState(io, match);
      cb(ok(result));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('ludo:resign' as any, (data: { matchId: string }, cb: (res: any) => void) => {
    try {
      const winnerColor = doResign(data.matchId, socket.id);
      const match = getMatch(data.matchId);
      if (!match) return cb(err('Match not found.'));

      const winner = winnerColor === 'red' ? match.red : match.blue;
      const loser  = winnerColor === 'red' ? match.blue : match.red;
      if (winner?.profileId) addXP(winner.profileId, 25).catch(() => {});
      if (loser?.profileId)  addXP(loser.profileId, 8).catch(() => {});

      broadcastState(io, match);
      broadcastList(io);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('ludo:rematch' as any, (data: { matchId: string }, cb: (res: any) => void) => {
    try {
      const old = getMatch(data.matchId);
      if (!old) return cb(err('Match not found.'));

      const nm = doRematch(data.matchId, socket.id);

      const redSock  = io.sockets.sockets.get(nm.red.socketId);
      const blueSock = nm.blue ? io.sockets.sockets.get(nm.blue.socketId) : null;
      if (redSock)  { redSock.join(LUDO_ROOM(nm.id));  redSock.leave(LUDO_ROOM(old.id)); }
      if (blueSock) { blueSock.join(LUDO_ROOM(nm.id)); blueSock.leave(LUDO_ROOM(old.id)); }
      for (const sid of nm.spectatorSocketIds) {
        const s = io.sockets.sockets.get(sid);
        if (s) { s.join(LUDO_ROOM(nm.id)); s.leave(LUDO_ROOM(old.id)); }
      }

      broadcastState(io, nm);
      broadcastList(io);
      cb(ok({ newMatchId: nm.id, newCode: nm.code }));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('ludo:leave' as any, (data: { matchId: string }, cb: (res: any) => void) => {
    try {
      const match = getMatch(data?.matchId);
      if (!match) return cb(ok(null));
      handleLudoLeave(io, socket.id, match);
      socket.leave(LUDO_ROOM(match.id));
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('ludo:chat' as any, (data: { matchId: string; text: string }, cb: (res: any) => void) => {
    try {
      const text = String(data.text ?? '').trim().slice(0, 300);
      if (!text) return cb(err('Empty message.'));
      const msg = addChat(data.matchId, socket.id, text);
      const match = getMatch(data.matchId);
      if (match) io.to(LUDO_ROOM(match.id)).emit('ludo:chat' as any, msg);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });
}

function handleLudoLeave(io: AppServer, socketId: string, match: LudoMatch): void {
  const { match: updated, wasPlayer } = doLeave(socketId);
  if (updated && wasPlayer) {
    broadcastState(io, updated);
    broadcastList(io);
  }
}

export function handleLudoDisconnect(io: AppServer, socketId: string): void {
  const match = cleanupSocket(socketId);
  if (match) {
    broadcastState(io, match);
    broadcastList(io);
  }
}
