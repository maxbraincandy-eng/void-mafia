/**
 * "What? Where? When?" (რა? სად? როდის?) team quiz game socket handlers.
 */
import { Server, Socket } from 'socket.io';
import { ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData, ok, err } from './types/index.js';
import {
  createMatch, getMatch, getMatchByCode, getMatchIdForUser, listMatches,
  joinMatch, spectateMatch, leaveMatch, assignCaptain, startMatch,
  advanceToDiscussion, submitAnswer, judgeAnswer, nextQuestion, sendChat,
  disconnectUser, toPublic,
} from './services/wwwService.js';
import { voiceJoin, voiceLeave, voiceGetMatchId } from './services/wwwVoiceService.js';
import { buildIceConfig } from './lib/iceConfig.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const WWW_ROOM = (id: string) => `www:${id}`;

function broadcast(io: AppServer, matchId: string, match: ReturnType<typeof toPublic>): void {
  io.to(WWW_ROOM(matchId)).emit('www:state' as any, match);
}

function broadcastList(io: AppServer): void {
  io.emit('www:list_update' as any, listMatches());
}

export function registerWWWHandlers(io: AppServer, socket: AppSocket): void {
  const userId = (): string => socket.data.profileId ?? socket.id;

  // ── list ──────────────────────────────────────────────────────────────
  socket.on('www:list' as any, (cb: (r: any) => void) => {
    try { cb(ok(listMatches())); } catch (e: any) { cb(err(e.message)); }
  });

  // ── create ────────────────────────────────────────────────────────────
  socket.on('www:create' as any, (data: { nickname?: string; opts?: any }, cb: (r: any) => void) => {
    try {
      const nickname = String(data?.nickname ?? 'Host').trim().slice(0, 24) || 'Host';
      const match = createMatch(userId(), nickname, data?.opts ?? {});
      socket.join(WWW_ROOM(match.id));
      broadcastList(io);
      cb(ok(toPublic(match)));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── join ──────────────────────────────────────────────────────────────
  socket.on('www:join' as any, (data: { code: string; nickname?: string }, cb: (r: any) => void) => {
    try {
      const code = String(data?.code ?? '').trim().toUpperCase();
      const nickname = String(data?.nickname ?? 'Player').trim().slice(0, 24) || 'Player';
      const m = getMatchByCode(code);
      if (!m) return cb(err('Match not found'));
      const result = joinMatch(m.id, userId(), nickname);
      if (!result) return cb(err('Cannot join — match already started or full'));
      socket.join(WWW_ROOM(m.id));
      if (result.isNew) broadcast(io, m.id, toPublic(result.match));
      broadcastList(io);
      cb(ok(toPublic(result.match)));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── spectate ──────────────────────────────────────────────────────────
  socket.on('www:spectate' as any, (data: { matchId: string; nickname?: string }, cb: (r: any) => void) => {
    try {
      const nickname = String(data?.nickname ?? 'Spectator').trim().slice(0, 24) || 'Spectator';
      const m = spectateMatch(String(data?.matchId), userId(), nickname);
      if (!m) return cb(err('Cannot spectate'));
      socket.join(WWW_ROOM(m.id));
      cb(ok(toPublic(m)));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── leave ─────────────────────────────────────────────────────────────
  socket.on('www:leave' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try {
      const matchId = String(data?.matchId);
      const m = leaveMatch(matchId, userId());
      socket.leave(WWW_ROOM(matchId));
      if (m) broadcast(io, matchId, toPublic(m));
      broadcastList(io);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── assign captain ────────────────────────────────────────────────────
  socket.on('www:assign_captain' as any, (data: { matchId: string; teamId: string; targetUserId: string }, cb: (r: any) => void) => {
    try {
      const m = assignCaptain(String(data?.matchId), userId(), String(data?.teamId), String(data?.targetUserId));
      if (!m) return cb(err('Cannot assign captain'));
      broadcast(io, m.id, toPublic(m));
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── start ─────────────────────────────────────────────────────────────
  socket.on('www:start' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try {
      const m = startMatch(String(data?.matchId), userId());
      if (!m) return cb(err('Cannot start match'));
      broadcast(io, m.id, toPublic(m));
      broadcastList(io);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── advance to discussion ─────────────────────────────────────────────
  socket.on('www:advance_discussion' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try {
      const m = advanceToDiscussion(String(data?.matchId), userId());
      if (!m) return cb(err('Cannot advance'));
      broadcast(io, m.id, toPublic(m));
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── submit answer ─────────────────────────────────────────────────────
  socket.on('www:submit_answer' as any, (data: { matchId: string; answerText: string }, cb: (r: any) => void) => {
    try {
      const m = submitAnswer(String(data?.matchId), userId(), String(data?.answerText ?? ''));
      if (!m) return cb(err('Cannot submit answer'));
      broadcast(io, m.id, toPublic(m));
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── judge answer ──────────────────────────────────────────────────────
  socket.on('www:judge' as any, (data: { matchId: string; teamId: string; isCorrect: boolean }, cb: (r: any) => void) => {
    try {
      const m = judgeAnswer(String(data?.matchId), userId(), String(data?.teamId), !!data?.isCorrect);
      if (!m) return cb(err('Cannot judge'));
      broadcast(io, m.id, toPublic(m));
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── next question ─────────────────────────────────────────────────────
  socket.on('www:next_question' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try {
      const m = nextQuestion(String(data?.matchId), userId());
      if (!m) return cb(err('Cannot advance'));
      broadcast(io, m.id, toPublic(m));
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── chat ──────────────────────────────────────────────────────────────
  socket.on('www:chat' as any, (data: { matchId: string; text: string; nickname: string }, _cb?: (r: any) => void) => {
    try {
      const m = sendChat(String(data?.matchId), userId(), String(data?.nickname ?? 'Player').slice(0, 24), String(data?.text ?? ''));
      if (!m) return;
      io.to(WWW_ROOM(m.id)).emit('www:chat' as any, m.chat[m.chat.length - 1]);
    } catch { /* ignore */ }
  });

  // ── voice: join ───────────────────────────────────────────────────────
  socket.on('www:voice_join' as any, (data: { matchId: string; name: string }, cb: (r: any) => void) => {
    try {
      const name = String(data?.name ?? 'Player').trim().slice(0, 24) || 'Player';
      const peers = voiceJoin(String(data?.matchId), socket.id, name);
      const iceConfig = buildIceConfig();
      cb(ok({ peers, iceConfig }));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── voice: leave ──────────────────────────────────────────────────────
  socket.on('www:voice_leave' as any, (data: { matchId: string }, cb?: (r: any) => void) => {
    const matchId = voiceLeave(socket.id);
    if (matchId) {
      socket.to(WWW_ROOM(matchId)).emit('www:voice_peer_left' as any, { socketId: socket.id });
    }
    if (cb) cb(ok(null));
  });

  // ── voice: signal (WebRTC offer/answer/ice) ───────────────────────────
  socket.on('www:voice_signal' as any, (data: { to: string; signal: any }) => {
    if (!data?.to || !data?.signal) return;
    socket.to(data.to).emit('www:voice_signal' as any, { from: socket.id, signal: data.signal });
  });

  // ── voice: speaking ───────────────────────────────────────────────────
  socket.on('www:voice_speaking' as any, (data: { speaking: boolean }) => {
    const matchId = voiceGetMatchId(socket.id);
    if (!matchId) return;
    socket.to(WWW_ROOM(matchId)).emit('www:voice_speaking' as any, { socketId: socket.id, speaking: !!data?.speaking });
  });
}

export function handleWWWDisconnect(io: AppServer, socketId: string): void {
  const matchId = disconnectUser(socketId);
  if (matchId) {
    const m = getMatch(matchId);
    if (m) broadcast(io, matchId, toPublic(m));
  }
  const voiceMatchId = voiceLeave(socketId);
  if (voiceMatchId) {
    io.to(WWW_ROOM(voiceMatchId)).emit('www:voice_peer_left' as any, { socketId });
  }
}
