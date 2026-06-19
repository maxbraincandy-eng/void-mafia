/**
 * WWW (What? Where? When? / რა? სად? როდის?) community game socket handlers.
 * Completely separate from Mafia rooms.
 */
import { Server, Socket } from 'socket.io';
import {
  ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData,
  ok, err,
} from './types/index.js';
import {
  createMatch, getMatch, getMatchByCode, getMatchList,
  joinMatch, spectateMatch, leaveMatch as serviceLeaveMatch,
  joinTeam as serviceJoinTeam, assignCaptain as serviceAssignCaptain,
  startMatch as serviceStartMatch, startDiscussion,
  submitAnswer as serviceSubmitAnswer, judgeAnswer as serviceJudgeAnswer,
  nextQuestion as serviceNextQuestion, sendChat as serviceSendChat,
  handleDisconnect as serviceHandleDisconnect,
  toPublic,
  type WWWSettings,
} from './services/wwwService.js';
import { buildIceConfig } from './lib/iceConfig.js';
import { voiceJoin, voiceLeave, voiceGetMatchId } from './services/wwwVoiceService.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const WWW_ROOM = (id: string) => `www:${id}`;

function broadcastState(io: AppServer, matchId: string): void {
  const match = getMatch(matchId);
  if (!match) return;
  io.to(WWW_ROOM(matchId)).emit('www:state' as any, toPublic(match));
}

// ── Handler Registration ───────────────────────────────────────────────────
export function registerWWWHandlers(io: AppServer, socket: AppSocket): void {
  const userId = () => socket.data.profileId ?? socket.id;

  // ── List matches ──────────────────────────────────────────────────
  socket.on('www:list' as any, (cb: (res: any) => void) => {
    try {
      cb(ok(getMatchList()));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── Create match ──────────────────────────────────────────────────
  socket.on('www:create' as any, (data: { settings?: Partial<WWWSettings>; nickname?: string }, cb: (res: any) => void) => {
    try {
      const uid = userId();
      const nickname = String(data?.nickname ?? 'Player').trim().slice(0, 30) || 'Player';
      const match = createMatch(uid, nickname, data?.settings ?? {});
      socket.join(WWW_ROOM(match.id));
      cb(ok({ match: toPublic(match) }));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── Join match by code ────────────────────────────────────────────
  socket.on('www:join' as any, (data: { code: string; nickname?: string }, cb: (res: any) => void) => {
    try {
      const uid = userId();
      const nickname = String(data?.nickname ?? 'Player').trim().slice(0, 30) || 'Player';
      const found = getMatchByCode(data?.code ?? '');
      if (!found) return cb(err('Match not found.'));

      // Already in match
      if (found.players[uid]) {
        socket.join(WWW_ROOM(found.id));
        return cb(ok({ match: toPublic(found) }));
      }

      const match = joinMatch(found.id, uid, nickname);
      if (!match) return cb(err('Cannot join this match.'));
      socket.join(WWW_ROOM(match.id));
      broadcastState(io, match.id);
      cb(ok({ match: toPublic(match) }));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── Spectate match ────────────────────────────────────────────────
  socket.on('www:spectate' as any, (data: { matchId: string }, cb: (res: any) => void) => {
    try {
      const uid = userId();
      const match = spectateMatch(data?.matchId, uid, 'Spectator');
      if (!match) return cb(err('Cannot spectate this match.'));
      socket.join(WWW_ROOM(match.id));
      cb(ok({ match: toPublic(match) }));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── Leave match ───────────────────────────────────────────────────
  socket.on('www:leave' as any, (cb?: (res: any) => void) => {
    try {
      const uid = userId();
      // Find the match this user is in by checking all matches
      // We look for their userId in players
      const list = getMatchList();
      let targetMatchId: string | null = null;
      for (const item of list) {
        const m = getMatch(item.id);
        if (m && m.players[uid]) { targetMatchId = m.id; break; }
      }

      if (targetMatchId) {
        const match = serviceLeaveMatch(targetMatchId, uid);
        socket.leave(WWW_ROOM(targetMatchId));
        if (match) {
          broadcastState(io, targetMatchId);
        }
      }

      cb?.(ok(null));
    } catch (e: any) { cb?.(err(e.message)); }
  });

  // ── Join team ─────────────────────────────────────────────────────
  socket.on('www:join-team' as any, (data: { matchId: string; teamId: string }, cb?: (res: any) => void) => {
    try {
      const uid = userId();
      const match = serviceJoinTeam(data?.matchId, uid, data?.teamId);
      if (!match) return cb?.(err('Cannot join team.'));
      broadcastState(io, match.id);
      cb?.(ok(null));
    } catch (e: any) { cb?.(err(e.message)); }
  });

  // ── Assign captain ────────────────────────────────────────────────
  socket.on('www:assign-captain' as any, (data: { matchId: string; targetUserId: string; teamId: string }, cb?: (res: any) => void) => {
    try {
      const uid = userId();
      const match = serviceAssignCaptain(data?.matchId, uid, data?.targetUserId, data?.teamId);
      if (!match) return cb?.(err('Cannot assign captain.'));
      broadcastState(io, match.id);
      cb?.(ok(null));
    } catch (e: any) { cb?.(err(e.message)); }
  });

  // ── Start match ───────────────────────────────────────────────────
  socket.on('www:start' as any, (data: { matchId: string }, cb?: (res: any) => void) => {
    try {
      const uid = userId();
      const match = serviceStartMatch(data?.matchId, uid);
      if (!match) return cb?.(err('Cannot start match.'));
      broadcastState(io, match.id);
      cb?.(ok(null));
    } catch (e: any) { cb?.(err(e.message)); }
  });

  // ── Advance to discussion phase ───────────────────────────────────
  socket.on('www:advance-discussion' as any, (data: { matchId: string }, cb?: (res: any) => void) => {
    try {
      const uid = userId();
      const match = startDiscussion(data?.matchId, uid);
      if (!match) return cb?.(err('Cannot start discussion.'));
      broadcastState(io, match.id);
      cb?.(ok(null));
    } catch (e: any) { cb?.(err(e.message)); }
  });

  // ── Submit answer (captain only) ──────────────────────────────────
  socket.on('www:submit-answer' as any, (data: { matchId: string; answerText: string }, cb?: (res: any) => void) => {
    try {
      const uid = userId();
      const match = serviceSubmitAnswer(data?.matchId, uid, data?.answerText ?? '');
      if (!match) return cb?.(err('Cannot submit answer.'));
      broadcastState(io, match.id);
      cb?.(ok(null));
    } catch (e: any) { cb?.(err(e.message)); }
  });

  // ── Judge answer (host only) ──────────────────────────────────────
  socket.on('www:judge-answer' as any, (data: { matchId: string; teamId: string; isCorrect: boolean; judgeNote?: string }, cb?: (res: any) => void) => {
    try {
      const uid = userId();
      const match = serviceJudgeAnswer(data?.matchId, uid, data?.teamId, !!data?.isCorrect, data?.judgeNote);
      if (!match) return cb?.(err('Cannot judge answer.'));
      broadcastState(io, match.id);
      cb?.(ok(null));
    } catch (e: any) { cb?.(err(e.message)); }
  });

  // ── Next question ─────────────────────────────────────────────────
  socket.on('www:next-question' as any, (data: { matchId: string }, cb?: (res: any) => void) => {
    try {
      const uid = userId();
      const match = serviceNextQuestion(data?.matchId, uid);
      if (!match) return cb?.(err('Cannot advance to next question.'));
      broadcastState(io, match.id);
      cb?.(ok(null));
    } catch (e: any) { cb?.(err(e.message)); }
  });

  // ── Chat ──────────────────────────────────────────────────────────
  socket.on('www:chat' as any, (data: { matchId: string; text: string }, cb?: (res: any) => void) => {
    try {
      const uid = userId();
      const targetMatch = getMatch(data?.matchId);
      if (!targetMatch) return cb?.(err('Match not found.'));
      const player = targetMatch.players[uid];
      const nickname = player?.nickname ?? 'Player';
      const text = String(data?.text ?? '').trim().slice(0, 300);
      if (!text) return cb?.(err('Empty message.'));
      const match = serviceSendChat(data.matchId, uid, nickname, text);
      if (!match) return cb?.(err('Match not found.'));
      broadcastState(io, match.id);
      cb?.(ok(null));
    } catch (e: any) { cb?.(err(e.message)); }
  });

  // ── Voice: join ───────────────────────────────────────────────────
  socket.on('www:voice-join' as any, (data: { matchId: string }, cb: (res: any) => void) => {
    try {
      const match = getMatch(data?.matchId);
      if (!match) return cb(err('Match not found.'));
      if (match.status === 'finished') return cb(err('Match has ended.'));

      const uid = userId();
      const player = match.players[uid];
      const isSpectator = match.spectators.includes(uid);
      if (!player && !isSpectator) return cb(err('Not in this match.'));

      const name = player?.nickname ?? 'Spectator';
      const existingPeers = voiceJoin(match.id, socket.id, name);
      socket.to(WWW_ROOM(match.id)).emit('www:voice-peer-joined' as any, {
        socketId: socket.id,
        name,
      });

      const iceConfig = buildIceConfig();
      cb(ok({
        peers: existingPeers,
        iceServers: iceConfig.iceServers,
        iceTransportPolicy: iceConfig.iceTransportPolicy,
        canSpeak: !isSpectator,
      }));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── Voice: leave ──────────────────────────────────────────────────
  socket.on('www:voice-leave' as any, (_data: any, cb?: (res: any) => void) => {
    const matchId = voiceLeave(socket.id);
    if (matchId) {
      socket.to(WWW_ROOM(matchId)).emit('www:voice-peer-left' as any, { socketId: socket.id });
    }
    cb?.(ok(null));
  });

  // ── Voice: WebRTC signalling relay ────────────────────────────────
  socket.on('www:voice-offer' as any, (data: { to: string; sdp: any }) => {
    io.to(data.to).emit('www:voice-offer' as any, { from: socket.id, sdp: data.sdp });
  });

  socket.on('www:voice-answer' as any, (data: { to: string; sdp: any }) => {
    io.to(data.to).emit('www:voice-answer' as any, { from: socket.id, sdp: data.sdp });
  });

  socket.on('www:voice-ice' as any, (data: { to: string; candidate: any }) => {
    io.to(data.to).emit('www:voice-ice' as any, { from: socket.id, candidate: data.candidate });
  });

  // ── Voice: Push-to-Talk state ─────────────────────────────────────
  socket.on('www:voice-start-talk' as any, (data: { matchId: string }) => {
    const match = getMatch(data?.matchId);
    if (!match) return;
    const uid = userId();
    const player = match.players[uid];
    if (!player || player.role === 'spectator') return;
    socket.to(WWW_ROOM(data.matchId)).emit('www:voice-peer-state' as any, {
      socketId: socket.id,
      speaking: true,
    });
  });

  socket.on('www:voice-stop-talk' as any, (data: { matchId: string }) => {
    const match = getMatch(data?.matchId);
    if (!match) return;
    const uid = userId();
    const player = match.players[uid];
    if (!player || player.role === 'spectator') return;
    socket.to(WWW_ROOM(data.matchId)).emit('www:voice-peer-state' as any, {
      socketId: socket.id,
      speaking: false,
    });
  });
}

// ── Disconnect cleanup ─────────────────────────────────────────────────────
export function handleWWWDisconnect(io: AppServer, socket: AppSocket): void {
  const uid = socket.data.profileId ?? socket.id;

  // Voice cleanup
  const voiceMatchId = voiceGetMatchId(socket.id);
  if (voiceMatchId) {
    voiceLeave(socket.id);
    io.to(WWW_ROOM(voiceMatchId)).emit('www:voice-peer-left' as any, { socketId: socket.id });
    io.to(WWW_ROOM(voiceMatchId)).emit('www:voice-peer-state' as any, { socketId: socket.id, speaking: false });
  }

  // Game state cleanup
  const matchId = serviceHandleDisconnect(uid);
  if (matchId) {
    const match = getMatch(matchId);
    if (match) {
      io.to(WWW_ROOM(matchId)).emit('www:state' as any, toPublic(match));
    }
  }
}
