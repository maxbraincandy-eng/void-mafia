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
  startMatch, PLAYER_ORDER,
  type LudoMatch, type LudoColor,
} from './services/ludoService.js';
import { award } from './services/legacyService.js';
import {
  voiceJoin as ludoVoiceJoin,
  voiceLeave as ludoVoiceLeave,
  voiceGetMatchId as ludoVoiceGetMatchId,
} from './services/ludoVoiceService.js';
import { buildIceConfig } from './lib/iceConfig.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const LUDO_ROOM = (id: string) => `ld:${id}`;

function toPublic(match: LudoMatch) {
  const mapSide = (s: import('./services/ludoService.js').LudoSide | null) => s ? {
    name: s.name,
    profileId: s.profileId,
    socketId: s.socketId,
    pieces: s.pieces,
  } : null;

  return {
    id: match.id,
    code: match.code,
    status: match.status,
    maxPlayers: match.maxPlayers,
    players: {
      red:    mapSide(match.players.red),
      blue:   mapSide(match.players.blue),
      green:  mapSide(match.players.green),
      yellow: mapSide(match.players.yellow),
    },
    playerOrder: match.playerOrder,
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
  const playerNames = PLAYER_ORDER
    .filter(c => match.players[c] !== null)
    .map(c => match.players[c]!.name);
  return {
    id: match.id,
    code: match.code,
    status: match.status,
    playerCount: playerNames.length,
    maxPlayers: match.maxPlayers,
    playerNames,
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

  socket.on('ludo:create' as any, (data: { name: string; maxPlayers?: number }, cb: (res: any) => void) => {
    try {
      const name = String(data?.name ?? 'Player').trim().slice(0, 24) || 'Player';
      const maxPlayers = ([2, 3, 4].includes(data?.maxPlayers as any) ? data.maxPlayers : 2) as 2 | 3 | 4;
      const existing = getMatchForSocket(socket.id);
      if (existing && existing.status !== 'finished') {
        return cb(err('You are already in a Ludo match.'));
      }
      const match = createMatch({ socketId: socket.id, name, profileId: socket.data.profileId ?? null }, maxPlayers);
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
      const isInMatch = PLAYER_ORDER.some(c => match.players[c]?.socketId === socket.id);
      if (isInMatch) {
        socket.join(LUDO_ROOM(match.id));
        return cb(ok(toPublic(match)));
      }

      const existing = getMatchForSocket(socket.id);
      if (existing && existing.id !== match.id && existing.status !== 'finished') {
        return cb(err('You are already in another Ludo match.'));
      }

      const { role } = joinMatch(match.id, { socketId: socket.id, name, profileId: socket.data.profileId ?? null });
      socket.join(LUDO_ROOM(match.id));

      if (role !== 'spectator') {
        broadcastState(io, match);
        broadcastList(io);
      }

      cb(ok(toPublic(match)));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('ludo:start' as any, (data: { matchId: string }, cb: (res: any) => void) => {
    try {
      const match = startMatch(data.matchId, socket.id);
      broadcastState(io, match);
      broadcastList(io);
      cb(ok(null));
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
        for (const color of PLAYER_ORDER) {
          const side = match.players[color];
          if (!side) continue;
          if (side.profileId) {
            award({ userId: side.profileId, source: 'ludo', amount: color === result.winnerColor ? 25 : 8, reason: color === result.winnerColor ? 'win' : 'played' });
          }
        }
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

      if (match.status === 'finished') {
        for (const color of PLAYER_ORDER) {
          const side = match.players[color];
          if (side?.profileId) {
            award({ userId: side.profileId, source: 'ludo', amount: color === winnerColor ? 25 : 8, reason: color === winnerColor ? 'win' : 'played' });
          }
        }
      }

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

      for (const color of PLAYER_ORDER) {
        const side = nm.players[color];
        if (side) {
          const s = io.sockets.sockets.get(side.socketId);
          if (s) { s.join(LUDO_ROOM(nm.id)); s.leave(LUDO_ROOM(old.id)); }
        }
      }
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

  // ── Voice (PTT) ──────────────────────────────────────────────────────
  socket.on('ludo:voice-join' as any, (data: { matchId: string; name: string }, cb: (res: any) => void) => {
    try {
      const match = getMatch(data.matchId);
      if (!match) return cb(err('Match not found.'));

      const peers = ludoVoiceJoin(data.matchId, socket.id, data.name ?? 'Player');
      const { iceServers, iceTransportPolicy } = buildIceConfig();

      socket.to(LUDO_ROOM(match.id)).emit('ludo:voice-peer-joined' as any, {
        socketId: socket.id,
        name: data.name ?? 'Player',
      });

      cb(ok({ peers, iceServers, iceTransportPolicy }));
    } catch (e: any) { cb(err(e.message ?? 'Failed to join voice.')); }
  });

  socket.on('ludo:voice-leave' as any, (_data: any, cb?: (res: any) => void) => {
    const matchId = ludoVoiceLeave(socket.id);
    if (matchId) {
      socket.to(LUDO_ROOM(matchId)).emit('ludo:voice-peer-left' as any, { socketId: socket.id });
    }
    cb?.(ok(null));
  });

  socket.on('ludo:voice-offer' as any, (data: { to: string; sdp: any }) => {
    io.to(data.to).emit('ludo:voice-offer' as any, { from: socket.id, sdp: data.sdp });
  });

  socket.on('ludo:voice-answer' as any, (data: { to: string; sdp: any }) => {
    io.to(data.to).emit('ludo:voice-answer' as any, { from: socket.id, sdp: data.sdp });
  });

  socket.on('ludo:voice-ice' as any, (data: { to: string; candidate: any }) => {
    io.to(data.to).emit('ludo:voice-ice' as any, { from: socket.id, candidate: data.candidate });
  });

  socket.on('ludo:ptt-start' as any, (data: { matchId: string }) => {
    const match = getMatch(data.matchId);
    if (!match) return;
    socket.to(LUDO_ROOM(data.matchId)).emit('ludo:ptt-state' as any, {
      socketId: socket.id, speaking: true,
    });
  });

  socket.on('ludo:ptt-stop' as any, (data: { matchId: string }) => {
    const match = getMatch(data.matchId);
    if (!match) return;
    socket.to(LUDO_ROOM(data.matchId)).emit('ludo:ptt-state' as any, {
      socketId: socket.id, speaking: false,
    });
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
  // Voice cleanup
  const voiceMatchId = ludoVoiceGetMatchId(socketId);
  if (voiceMatchId) {
    ludoVoiceLeave(socketId);
    io.to(LUDO_ROOM(voiceMatchId)).emit('ludo:voice-peer-left' as any, { socketId });
    io.to(LUDO_ROOM(voiceMatchId)).emit('ludo:ptt-state' as any, { socketId, speaking: false });
  }

  const match = cleanupSocket(socketId);
  if (match) {
    broadcastState(io, match);
    broadcastList(io);
  }
}
