/**
 * "What? Where? When?" (რა? სად? როდის?) socket handlers.
 * Completely separate from Mafia rooms and other mini-games.
 */
import { Server, Socket } from 'socket.io';
import {
  ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData,
  ok, err,
} from './types/index.js';
import {
  createMatch, getMatch, getMatchByCode, getMatchList,
  joinMatch, spectateMatch, leaveMatch, joinTeam, assignCaptain,
  startMatch, advanceToDiscussion, submitAnswer, judgeAnswer,
  nextQuestion, sendChat, handleDisconnect, toPublic,
  type WWWSettings,
} from './services/wwwService.js';
import { buildIceConfig } from './lib/iceConfig.js';
import {
  voiceJoin as wwwVoiceJoin,
  voiceLeave as wwwVoiceLeave,
  voiceGetMatchId as wwwVoiceGetMatchId,
} from './services/wwwVoiceService.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const WWW_ROOM = (id: string) => `www:${id}`;

// Tracking which matchId each socket is in for WWW
const socketMatchMap = new Map<string, string>(); // socketId → matchId

function broadcastState(io: AppServer, matchId: string): void {
  const match = getMatch(matchId);
  if (!match) return;
  io.to(WWW_ROOM(matchId)).emit('www:state' as any, toPublic(match));
}

// ── Handler Registration ───────────────────────────────────────────────

export function registerWWWHandlers(io: AppServer, socket: AppSocket): void {

  // ── List matches ──────────────────────────────────────────────────
  socket.on('www:list' as any, (cb: (res: any) => void) => {
    try {
      cb(ok(getMatchList()));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── Get current state ─────────────────────────────────────────────
  socket.on('www:state' as any, (cb: (res: any) => void) => {
    try {
      const matchId = socketMatchMap.get(socket.id);
      if (!matchId) return cb(err('Not in a match.'));
      const match = getMatch(matchId);
      if (!match) return cb(err('Match not found.'));
      cb(ok(toPublic(match)));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── Create match ──────────────────────────────────────────────────
  socket.on('www:create' as any, (data: { nickname: string; settings?: Partial<WWWSettings> }, cb: (res: any) => void) => {
    try {
      const userId = socket.id;
      const nickname = String(data?.nickname ?? 'Player').trim().slice(0, 24) || 'Player';

      // Leave existing match
      const existingMatchId = socketMatchMap.get(socket.id);
      if (existingMatchId) {
        leaveMatch(existingMatchId, userId);
        socket.leave(WWW_ROOM(existingMatchId));
        socketMatchMap.delete(socket.id);
        broadcastState(io, existingMatchId);
      }

      const match = createMatch(userId, nickname, data?.settings);
      socketMatchMap.set(socket.id, match.id);
      socket.join(WWW_ROOM(match.id));
      cb(ok(toPublic(match)));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── Join as player ────────────────────────────────────────────────
  socket.on('www:join' as any, (data: { code: string; nickname: string }, cb: (res: any) => void) => {
    try {
      const userId = socket.id;
      const nickname = String(data?.nickname ?? 'Player').trim().slice(0, 24) || 'Player';
      const match = getMatchByCode(data?.code ?? '');
      if (!match) return cb(err('Match not found.'));

      // Leave existing match
      const existingMatchId = socketMatchMap.get(socket.id);
      if (existingMatchId && existingMatchId !== match.id) {
        leaveMatch(existingMatchId, userId);
        socket.leave(WWW_ROOM(existingMatchId));
        broadcastState(io, existingMatchId);
      }

      const updated = joinMatch(match.id, userId, nickname);
      if (!updated) return cb(err('Cannot join this match.'));

      socketMatchMap.set(socket.id, match.id);
      socket.join(WWW_ROOM(match.id));
      broadcastState(io, match.id);
      cb(ok(toPublic(updated)));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── Join as spectator ──────────────────────────────────────────────
  socket.on('www:spectate' as any, (data: { code: string; nickname: string }, cb: (res: any) => void) => {
    try {
      const userId = socket.id;
      const nickname = String(data?.nickname ?? 'Spectator').trim().slice(0, 24) || 'Spectator';
      const match = getMatchByCode(data?.code ?? '');
      if (!match) return cb(err('Match not found.'));

      const existingMatchId = socketMatchMap.get(socket.id);
      if (existingMatchId && existingMatchId !== match.id) {
        leaveMatch(existingMatchId, userId);
        socket.leave(WWW_ROOM(existingMatchId));
        broadcastState(io, existingMatchId);
      }

      const updated = spectateMatch(match.id, userId, nickname);
      if (!updated) return cb(err('Cannot spectate this match.'));

      socketMatchMap.set(socket.id, match.id);
      socket.join(WWW_ROOM(match.id));
      cb(ok(toPublic(updated)));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── Leave ─────────────────────────────────────────────────────────
  socket.on('www:leave' as any, (cb?: (res: any) => void) => {
    try {
      const userId = socket.id;
      const matchId = socketMatchMap.get(socket.id);
      if (!matchId) { cb && cb(ok(null)); return; }

      leaveMatch(matchId, userId);
      socket.leave(WWW_ROOM(matchId));
      socketMatchMap.delete(socket.id);
      broadcastState(io, matchId);
      cb && cb(ok(null));
    } catch (e: any) { cb && cb(err(e.message)); }
  });

  // ── Join team ─────────────────────────────────────────────────────
  socket.on('www:join-team' as any, (data: { teamId: string }, cb: (res: any) => void) => {
    try {
      const matchId = socketMatchMap.get(socket.id);
      if (!matchId) return cb(err('Not in a match.'));

      const updated = joinTeam(matchId, socket.id, data?.teamId);
      if (!updated) return cb(err('Cannot join this team.'));

      broadcastState(io, matchId);
      cb(ok(toPublic(updated)));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── Assign captain (host only) ────────────────────────────────────
  socket.on('www:assign-captain' as any, (data: { targetUserId: string; teamId: string }, cb: (res: any) => void) => {
    try {
      const matchId = socketMatchMap.get(socket.id);
      if (!matchId) return cb(err('Not in a match.'));

      const updated = assignCaptain(matchId, socket.id, data?.targetUserId, data?.teamId);
      if (!updated) return cb(err('Cannot assign captain.'));

      broadcastState(io, matchId);
      cb(ok(toPublic(updated)));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── Start match (host only) ───────────────────────────────────────
  socket.on('www:start' as any, (cb?: (res: any) => void) => {
    try {
      const matchId = socketMatchMap.get(socket.id);
      if (!matchId) { cb && cb(err('Not in a match.')); return; }

      const updated = startMatch(matchId, socket.id);
      if (!updated) { cb && cb(err('Cannot start match.')); return; }

      broadcastState(io, matchId);
      cb && cb(ok(toPublic(updated)));
    } catch (e: any) { cb && cb(err(e.message)); }
  });

  // ── Advance to discussion (host only) ─────────────────────────────
  socket.on('www:advance-discussion' as any, (cb?: (res: any) => void) => {
    try {
      const matchId = socketMatchMap.get(socket.id);
      if (!matchId) { cb && cb(err('Not in a match.')); return; }

      const match = getMatch(matchId);
      if (!match || match.hostId !== socket.id) { cb && cb(err('Not authorized.')); return; }

      const updated = advanceToDiscussion(matchId);
      if (!updated) { cb && cb(err('Cannot advance to discussion.')); return; }

      broadcastState(io, matchId);
      cb && cb(ok(toPublic(updated)));
    } catch (e: any) { cb && cb(err(e.message)); }
  });

  // ── Submit answer (captain only) ──────────────────────────────────
  socket.on('www:submit-answer' as any, (data: { answerText: string }, cb: (res: any) => void) => {
    try {
      const matchId = socketMatchMap.get(socket.id);
      if (!matchId) return cb(err('Not in a match.'));

      const updated = submitAnswer(matchId, socket.id, data?.answerText ?? '');
      if (!updated) return cb(err('Cannot submit answer.'));

      broadcastState(io, matchId);
      cb(ok(toPublic(updated)));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── Judge answer (host only) ──────────────────────────────────────
  socket.on('www:judge-answer' as any, (data: { teamId: string; isCorrect: boolean; judgeNote?: string }, cb: (res: any) => void) => {
    try {
      const matchId = socketMatchMap.get(socket.id);
      if (!matchId) return cb(err('Not in a match.'));

      const updated = judgeAnswer(matchId, socket.id, data?.teamId, data?.isCorrect, data?.judgeNote);
      if (!updated) return cb(err('Cannot judge answer.'));

      broadcastState(io, matchId);
      cb(ok(toPublic(updated)));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── Next question (host only) ─────────────────────────────────────
  socket.on('www:next-question' as any, (cb?: (res: any) => void) => {
    try {
      const matchId = socketMatchMap.get(socket.id);
      if (!matchId) { cb && cb(err('Not in a match.')); return; }

      const updated = nextQuestion(matchId, socket.id);
      if (!updated) { cb && cb(err('Cannot advance to next question.')); return; }

      broadcastState(io, matchId);
      cb && cb(ok(toPublic(updated)));
    } catch (e: any) { cb && cb(err(e.message)); }
  });

  // ── Chat ──────────────────────────────────────────────────────────
  socket.on('www:chat' as any, (data: { text: string }, cb: (res: any) => void) => {
    try {
      const matchId = socketMatchMap.get(socket.id);
      if (!matchId) return cb(err('Not in a match.'));
      const match = getMatch(matchId);
      if (!match) return cb(err('Match not found.'));
      const player = match.players[socket.id];
      const nickname = player?.nickname ?? 'Unknown';

      const updated = sendChat(matchId, socket.id, nickname, data?.text ?? '');
      if (!updated) return cb(err('Cannot send message.'));

      broadcastState(io, matchId);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── Voice: join ───────────────────────────────────────────────────
  socket.on('www:voice-join' as any, (data: { matchId: string }, cb: (res: any) => void) => {
    try {
      const matchId = data?.matchId;
      const match = getMatch(matchId);
      if (!match) return cb(err('Match not found.'));

      const player = match.players[socket.id];
      const name = player?.nickname ?? 'Player';

      const iceConfig = buildIceConfig();
      const existingPeers = wwwVoiceJoin(matchId, socket.id, name);

      // Notify existing peers of the new joiner
      for (const peer of existingPeers) {
        io.to(peer.socketId).emit('www:voice-peer-joined' as any, { socketId: socket.id, name });
      }

      cb(ok({
        peers: existingPeers,
        iceServers: iceConfig.iceServers,
        iceTransportPolicy: iceConfig.iceTransportPolicy,
      }));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── Voice: leave ──────────────────────────────────────────────────
  socket.on('www:voice-leave' as any, (data: { matchId: string }) => {
    const matchId = wwwVoiceLeave(socket.id);
    if (matchId) {
      io.to(WWW_ROOM(matchId)).emit('www:voice-peer-left' as any, { socketId: socket.id });
    }
  });

  // ── Voice: WebRTC signaling ────────────────────────────────────────
  socket.on('www:voice-offer' as any, (data: { to: string; sdp: object }) => {
    io.to(data.to).emit('www:voice-offer' as any, { from: socket.id, sdp: data.sdp });
  });

  socket.on('www:voice-answer' as any, (data: { to: string; sdp: object }) => {
    io.to(data.to).emit('www:voice-answer' as any, { from: socket.id, sdp: data.sdp });
  });

  socket.on('www:voice-ice' as any, (data: { to: string; candidate: object }) => {
    io.to(data.to).emit('www:voice-ice' as any, { from: socket.id, candidate: data.candidate });
  });

  // ── Voice: PTT ────────────────────────────────────────────────────
  socket.on('www:voice-start-talk' as any, (data: { matchId: string }) => {
    const matchId = data?.matchId;
    if (!matchId) return;
    socket.to(WWW_ROOM(matchId)).emit('www:voice-peer-state' as any, { socketId: socket.id, speaking: true });
  });

  socket.on('www:voice-stop-talk' as any, (data: { matchId: string }) => {
    const matchId = data?.matchId;
    if (!matchId) return;
    socket.to(WWW_ROOM(matchId)).emit('www:voice-peer-state' as any, { socketId: socket.id, speaking: false });
  });
}

// ── Disconnect cleanup ─────────────────────────────────────────────────

export function handleWWWDisconnect(io: AppServer, socket: AppSocket): void {
  const socketId = socket.id;

  // Voice cleanup
  const voiceMatchId = wwwVoiceGetMatchId(socketId);
  if (voiceMatchId) {
    wwwVoiceLeave(socketId);
    io.to(WWW_ROOM(voiceMatchId)).emit('www:voice-peer-left' as any, { socketId });
    io.to(WWW_ROOM(voiceMatchId)).emit('www:voice-peer-state' as any, { socketId, speaking: false });
  }

  // Match cleanup
  const matchId = socketMatchMap.get(socketId);
  if (matchId) {
    handleDisconnect(socketId);
    socketMatchMap.delete(socketId);
    broadcastState(io, matchId);
  }
}
