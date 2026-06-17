/**
 * Checkers mini-game socket handlers.
 * Completely separate from Mafia rooms.
 */
import { Server, Socket } from 'socket.io';
import {
  ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData,
  ok, err,
} from './types/index.js';
import {
  createMatch, getMatch, getMatchByCode, getMatchForSocket, getOpenMatches,
  applyMove, finishMatch,
  type CheckersMatch, type PieceColor, type CheckersChatMsg,
} from './services/checkersService.js';
import { addXP } from './services/playerService.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const CHECKERS_ROOM = (id: string) => `ck:${id}`;

// ── Public state shape sent to clients ─────────────────────────────────
function toPublic(match: CheckersMatch, viewerSocketId: string) {
  let myColor: 'red' | 'black' | 'spectator' | null = null;
  if (match.red.socketId === viewerSocketId) myColor = 'red';
  else if (match.black?.socketId === viewerSocketId) myColor = 'black';
  else if (match.spectatorSocketIds.includes(viewerSocketId)) myColor = 'spectator';

  return {
    id: match.id,
    code: match.code,
    status: match.status,
    red: { name: match.red.name, profileId: match.red.profileId },
    black: match.black ? { name: match.black.name, profileId: match.black.profileId } : null,
    currentTurn: match.currentTurn,
    board: match.board,
    capturedByRed: match.capturedByRed,
    capturedByBlack: match.capturedByBlack,
    winnerColor: match.winnerColor,
    settings: match.settings,
    chat: match.chat.slice(-80),
    spectatorCount: match.spectatorSocketIds.length,
    mustContinueFrom: match.mustContinueFrom,
    myColor,
  };
}

function toListItem(match: CheckersMatch) {
  return {
    id: match.id,
    code: match.code,
    status: match.status,
    redName: match.red.name,
    blackName: match.black?.name ?? null,
    currentTurn: match.currentTurn,
    spectatorCount: match.spectatorSocketIds.length,
    createdAt: match.createdAt,
  };
}

// Broadcast full state to everyone in the socket room
function broadcastState(io: AppServer, match: CheckersMatch): void {
  const room = CHECKERS_ROOM(match.id);
  // Broadcast individual states (myColor differs per socket)
  const sockets = [match.red, match.black]
    .filter(Boolean)
    .map(p => p!.socketId)
    .concat(match.spectatorSocketIds);

  for (const sid of sockets) {
    io.to(sid).emit('checkers:state' as any, toPublic(match, sid));
  }
}

// ── Handler Registration ───────────────────────────────────────────────
export function registerCheckersHandlers(io: AppServer, socket: AppSocket): void {

  // ── List open matches ──────────────────────────────────────────────
  socket.on('checkers:list' as any, (cb: (res: any) => void) => {
    try {
      const open = getOpenMatches().map(toListItem);
      cb(ok(open));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── Create match ──────────────────────────────────────────────────
  socket.on('checkers:create' as any, (data: { name: string }, cb: (res: any) => void) => {
    try {
      const name = String(data?.name ?? 'Player').trim().slice(0, 24) || 'Player';
      const existing = getMatchForSocket(socket.id);
      if (existing && existing.status !== 'finished') {
        return cb(err('You are already in a checkers match.'));
      }

      const match = createMatch(
        { socketId: socket.id, name, profileId: socket.data.profileId ?? null },
        { forcedCapture: true, allowSpectators: true },
      );
      socket.join(CHECKERS_ROOM(match.id));
      cb(ok(toPublic(match, socket.id)));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── Join match ────────────────────────────────────────────────────
  socket.on('checkers:join' as any, (data: { code: string; name: string }, cb: (res: any) => void) => {
    try {
      const name = String(data?.name ?? 'Player').trim().slice(0, 24) || 'Player';
      const match = getMatchByCode(data.code ?? '');
      if (!match) return cb(err('Match not found.'));
      if (match.status === 'finished') return cb(err('This match has ended.'));

      // Already in this match?
      if (match.red.socketId === socket.id || match.black?.socketId === socket.id) {
        socket.join(CHECKERS_ROOM(match.id));
        return cb(ok(toPublic(match, socket.id)));
      }

      // Existing match check
      const existing = getMatchForSocket(socket.id);
      if (existing && existing.id !== match.id && existing.status !== 'finished') {
        return cb(err('You are already in another checkers match.'));
      }

      if (match.status === 'waiting' && !match.black) {
        // Join as black player
        match.black = { socketId: socket.id, name, profileId: socket.data.profileId ?? null };
        match.status = 'active';
        match.updatedAt = Date.now();
        socket.join(CHECKERS_ROOM(match.id));
        broadcastState(io, match);
        // Notify list subscribers
        io.emit('checkers:list_update' as any, getOpenMatches().map(toListItem));
        cb(ok(toPublic(match, socket.id)));
      } else if (match.settings.allowSpectators && !match.spectatorSocketIds.includes(socket.id)) {
        // Join as spectator
        match.spectatorSocketIds.push(socket.id);
        socket.join(CHECKERS_ROOM(match.id));
        cb(ok(toPublic(match, socket.id)));
      } else {
        cb(err('Cannot join this match.'));
      }
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── Make move ─────────────────────────────────────────────────────
  socket.on('checkers:move' as any, (
    data: { matchId: string; from: { row: number; col: number }; to: { row: number; col: number } },
    cb: (res: any) => void,
  ) => {
    try {
      const match = getMatch(data.matchId);
      if (!match) return cb(err('Match not found.'));
      if (match.status !== 'active') return cb(err('Match is not active.'));

      // Determine caller's color
      let myColor: PieceColor | null = null;
      if (match.red.socketId === socket.id) myColor = 'red';
      else if (match.black?.socketId === socket.id) myColor = 'black';
      if (!myColor) return cb(err('You are not a player in this match.'));
      if (match.currentTurn !== myColor) return cb(err('Not your turn.'));

      const result = applyMove(
        match,
        data.from.row, data.from.col,
        data.to.row, data.to.col,
      );

      if (!result.ok) return cb(err(result.error));

      // Apply to match state
      match.board = result.board;
      match.mustContinueFrom = result.mustContinueFrom;
      if (result.captured) {
        if (myColor === 'red') match.capturedByRed++;
        else match.capturedByBlack++;
      }

      if (result.winnerColor) {
        finishMatch(match, result.winnerColor);
        // Award XP
        const winner = result.winnerColor === 'red' ? match.red : match.black;
        const loser  = result.winnerColor === 'red' ? match.black : match.red;
        if (winner?.profileId) addXP(winner.profileId, 20).catch(() => {});
        if (loser?.profileId)  addXP(loser.profileId, 5).catch(() => {});
      } else if (!result.mustContinueFrom) {
        // Turn ends only when multi-jump chain is complete
        match.currentTurn = myColor === 'red' ? 'black' : 'red';
      }

      match.updatedAt = Date.now();
      broadcastState(io, match);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── Resign ────────────────────────────────────────────────────────
  socket.on('checkers:resign' as any, (data: { matchId: string }, cb: (res: any) => void) => {
    try {
      const match = getMatch(data.matchId);
      if (!match) return cb(err('Match not found.'));
      if (match.status !== 'active') return cb(err('Match is not active.'));

      let winner: PieceColor | null = null;
      if (match.red.socketId === socket.id) winner = 'black';
      else if (match.black?.socketId === socket.id) winner = 'red';
      else return cb(err('You are not a player.'));

      finishMatch(match, winner);
      const loserColor: PieceColor = winner === 'red' ? 'black' : 'red';
      const winnerPart = winner === 'red' ? match.red : match.black;
      const loserPart  = loserColor === 'red' ? match.red : match.black;
      if (winnerPart?.profileId) addXP(winnerPart.profileId, 20).catch(() => {});
      if (loserPart?.profileId)  addXP(loserPart.profileId, 5).catch(() => {});

      broadcastState(io, match);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── Rematch ───────────────────────────────────────────────────────
  socket.on('checkers:rematch' as any, (data: { matchId: string }, cb: (res: any) => void) => {
    try {
      const old = getMatch(data.matchId);
      if (!old) return cb(err('Match not found.'));
      if (old.status !== 'finished') return cb(err('Match is still active.'));

      const isRed   = old.red.socketId === socket.id;
      const isBlack = old.black?.socketId === socket.id;
      if (!isRed && !isBlack) return cb(err('You are not a player.'));

      // Swap colors for rematch
      const newRedParticipant    = isRed ? old.black! : old.red;
      const newBlackParticipant  = isRed ? old.red : old.black!;

      const nm = createMatch(
        { ...newRedParticipant },
        old.settings,
      );
      nm.black = { ...newBlackParticipant };
      nm.status = 'active';

      // Move both sockets to new room
      const redSocket   = io.sockets.sockets.get(newRedParticipant.socketId);
      const blackSocket = io.sockets.sockets.get(newBlackParticipant.socketId);
      if (redSocket)   { redSocket.join(CHECKERS_ROOM(nm.id));   redSocket.leave(CHECKERS_ROOM(old.id)); }
      if (blackSocket) { blackSocket.join(CHECKERS_ROOM(nm.id)); blackSocket.leave(CHECKERS_ROOM(old.id)); }

      broadcastState(io, nm);
      cb(ok({ newMatchId: nm.id, newCode: nm.code }));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── Leave ─────────────────────────────────────────────────────────
  socket.on('checkers:leave' as any, (data: { matchId: string }, cb: (res: any) => void) => {
    try {
      const match = getMatch(data?.matchId);
      if (!match) return cb(ok(null));
      handleCheckersLeave(io, socket.id, match);
      socket.leave(CHECKERS_ROOM(match.id));
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── Chat ──────────────────────────────────────────────────────────
  socket.on('checkers:chat' as any, (data: { matchId: string; text: string }, cb: (res: any) => void) => {
    try {
      const match = getMatch(data.matchId);
      if (!match) return cb(err('Match not found.'));

      const isParticipant =
        match.red.socketId === socket.id ||
        match.black?.socketId === socket.id ||
        (match.settings.allowSpectators && match.spectatorSocketIds.includes(socket.id));
      if (!isParticipant) return cb(err('Not in this match.'));

      const text = String(data.text ?? '').trim().slice(0, 300);
      if (!text) return cb(err('Empty message.'));

      let senderName = 'Player';
      if (match.red.socketId === socket.id) senderName = match.red.name;
      else if (match.black?.socketId === socket.id) senderName = match.black.name;
      else senderName = 'Spectator';

      const msg: CheckersChatMsg = {
        senderId: socket.data.profileId ?? socket.id,
        senderName,
        text,
        ts: Date.now(),
      };
      match.chat.push(msg);
      if (match.chat.length > 200) match.chat = match.chat.slice(-200);

      io.to(CHECKERS_ROOM(match.id)).emit('checkers:chat' as any, msg);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });
}

// ── Disconnect cleanup ─────────────────────────────────────────────────
export function handleCheckersDisconnect(io: AppServer, socketId: string): void {
  const match = getMatchForSocket(socketId);
  if (!match) return;
  handleCheckersLeave(io, socketId, match);
}

function handleCheckersLeave(io: AppServer, socketId: string, match: CheckersMatch): void {
  // Remove from spectators
  const specIdx = match.spectatorSocketIds.indexOf(socketId);
  if (specIdx !== -1) {
    match.spectatorSocketIds.splice(specIdx, 1);
    broadcastState(io, match);
    return;
  }

  // Player leaving — if game is active, opponent wins
  if (match.status === 'active') {
    let winnerColor: PieceColor | null = null;
    if (match.red.socketId === socketId) winnerColor = 'black';
    else if (match.black?.socketId === socketId) winnerColor = 'red';
    if (winnerColor) {
      finishMatch(match, winnerColor);
      broadcastState(io, match);
    }
  } else if (match.status === 'waiting' && match.red.socketId === socketId) {
    // Creator left before anyone joined — delete match
    const rk = `ck:${match.id}`;
    io.in(rk).socketsLeave(rk);
    finishMatch(match, null);
    io.emit('checkers:list_update' as any, getOpenMatches().map(m => ({
      id: m.id, code: m.code, status: m.status,
      redName: m.red.name, blackName: m.black?.name ?? null,
      currentTurn: m.currentTurn, spectatorCount: m.spectatorSocketIds.length, createdAt: m.createdAt,
    })));
  }
}
