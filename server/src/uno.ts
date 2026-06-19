/**
 * UNO card game socket handlers.
 */
import { Server, Socket } from 'socket.io';
import {
  ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData,
  ok, err,
} from './types/index.js';
import {
  createMatch, getMatch, getMatchByCode, getMatchForSocket, listMatches,
  joinMatch, spectateMatch, leaveMatch, startMatch, playCard, drawCard,
  callUno, sendChat, disconnectSocket, rematch, getSafeState,
  type GameColor,
} from './services/unoService.js';
import {
  voiceJoin as unoVoiceJoin,
  voiceLeave as unoVoiceLeave,
  voiceGetMatchId as unoVoiceGetMatchId,
} from './services/unoVoiceService.js';
import { buildIceConfig } from './lib/iceConfig.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const UNO_ROOM = (id: string) => `uno:${id}`;

function userId(socket: AppSocket): string {
  return socket.data.profileId ?? socket.id;
}

function broadcastState(io: AppServer, matchId: string): void {
  const m = getMatch(matchId);
  if (!m) return;
  // Send personalized state to each player
  for (const player of m.players) {
    const playerSockets = [...io.sockets.sockets.values()].filter(s => s.id === player.socketId);
    for (const s of playerSockets) {
      s.emit('uno:state' as any, getSafeState(m, player.userId));
    }
  }
  // Send spectator state (no hand) to spectators
  const spectatorState = getSafeState(m, '');
  for (const specSocketId of m.spectatorIds) {
    io.to(specSocketId).emit('uno:state' as any, spectatorState);
  }
}

function broadcastList(io: AppServer): void {
  io.emit('uno:list_update' as any, listMatches());
}

export function registerUnoHandlers(io: AppServer, socket: AppSocket): void {
  const uid = () => userId(socket);

  // ── list ──────────────────────────────────────────────────────────────
  socket.on('uno:list' as any, (cb: (r: any) => void) => {
    try { cb(ok(listMatches())); } catch (e: any) { cb(err(e.message)); }
  });

  // ── create ────────────────────────────────────────────────────────────
  socket.on('uno:create' as any, (data: { nickname?: string; maxPlayers?: number }, cb: (r: any) => void) => {
    try {
      const nickname = String(data?.nickname ?? 'Host').trim().slice(0, 24) || 'Host';
      const maxPlayers = Math.min(10, Math.max(2, Number(data?.maxPlayers ?? 4)));
      const m = createMatch(uid(), socket.id, nickname, { maxPlayers });
      socket.join(UNO_ROOM(m.id));
      broadcastList(io);
      cb(ok(getSafeState(m, uid())));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── join ──────────────────────────────────────────────────────────────
  socket.on('uno:join' as any, (data: { code: string; nickname?: string }, cb: (r: any) => void) => {
    try {
      const code = String(data?.code ?? '').trim().toUpperCase();
      const nickname = String(data?.nickname ?? 'Player').trim().slice(0, 24) || 'Player';
      const m = getMatchByCode(code);
      if (!m) return cb(err('Match not found'));

      const result = joinMatch(m.id, uid(), socket.id, nickname);
      if (!result) return cb(err('Cannot join — match full or already started'));

      socket.join(UNO_ROOM(m.id));
      if (result.isNew) broadcastState(io, m.id);
      broadcastList(io);
      cb(ok(getSafeState(result.match, uid())));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── spectate ──────────────────────────────────────────────────────────
  socket.on('uno:spectate' as any, (data: { code: string }, cb: (r: any) => void) => {
    try {
      const code = String(data?.code ?? '').trim().toUpperCase();
      const m = getMatchByCode(code);
      if (!m) return cb(err('Match not found'));

      const result = spectateMatch(m.id, socket.id);
      if (!result) return cb(err('Cannot spectate'));

      socket.join(UNO_ROOM(m.id));
      cb(ok(getSafeState(result, '')));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── leave ─────────────────────────────────────────────────────────────
  socket.on('uno:leave' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try {
      const matchId = String(data?.matchId);
      const m = leaveMatch(matchId, uid(), socket.id);
      socket.leave(UNO_ROOM(matchId));
      if (m) { broadcastState(io, matchId); broadcastList(io); }
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── start ─────────────────────────────────────────────────────────────
  socket.on('uno:start' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try {
      const m = startMatch(String(data?.matchId), uid());
      if (!m) return cb(err('Cannot start'));
      broadcastState(io, m.id);
      broadcastList(io);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── play card ─────────────────────────────────────────────────────────
  socket.on('uno:play-card' as any, (data: { matchId: string; cardId: string; chosenColor?: GameColor }, cb: (r: any) => void) => {
    try {
      const result = playCard(String(data?.matchId), uid(), String(data?.cardId), data?.chosenColor);
      if (!result) return cb(err('Match not found'));
      if (result.error) return cb(err(result.error));
      broadcastState(io, result.match.id);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── draw card ─────────────────────────────────────────────────────────
  socket.on('uno:draw-card' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try {
      const result = drawCard(String(data?.matchId), uid());
      if (!result) return cb(err('Match not found'));
      if (result.error) return cb(err(result.error));
      broadcastState(io, result.match.id);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── call UNO ──────────────────────────────────────────────────────────
  socket.on('uno:call-uno' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try {
      const m = callUno(String(data?.matchId), uid());
      if (!m) return cb(err('Cannot call UNO'));
      broadcastState(io, m.id);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── rematch ───────────────────────────────────────────────────────────
  socket.on('uno:rematch' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try {
      const m = rematch(String(data?.matchId), uid());
      if (!m) return cb(err('Cannot rematch'));
      broadcastState(io, m.id);
      broadcastList(io);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── chat ──────────────────────────────────────────────────────────────
  socket.on('uno:chat' as any, (data: { matchId: string; text: string; nickname: string }) => {
    try {
      const result = sendChat(String(data?.matchId), uid(), String(data?.nickname ?? 'Player').slice(0, 24), String(data?.text ?? ''));
      if (!result) return;
      io.to(UNO_ROOM(result.match.id)).emit('uno:chat' as any, result.msg);
    } catch { /* ignore */ }
  });

  // ── voice: join ───────────────────────────────────────────────────────
  socket.on('uno:voice-join' as any, (data: { matchId: string }, cb: (res: any) => void) => {
    try {
      const m = getMatch(String(data?.matchId));
      if (!m) return cb(err('Match not found.'));
      if (m.status === 'finished') return cb(err('Match has ended.'));

      const player = m.players.find(p => p.socketId === socket.id);
      const isSpectator = m.spectatorIds.includes(socket.id);
      if (!player && !isSpectator) return cb(err('Not in this match.'));

      const name = player?.nickname ?? 'Spectator';
      const existingPeers = unoVoiceJoin(m.id, socket.id, name);

      socket.to(UNO_ROOM(m.id)).emit('uno:voice-peer-joined' as any, { socketId: socket.id, name });

      const iceConfig = buildIceConfig();
      cb(ok({
        peers: existingPeers,
        iceServers: iceConfig.iceServers,
        iceTransportPolicy: iceConfig.iceTransportPolicy,
        canSpeak: !!player,
      }));
    } catch (e: any) { cb(err(e.message)); }
  });

  // ── voice: leave ──────────────────────────────────────────────────────
  socket.on('uno:voice-leave' as any, (_data: any, cb?: (res: any) => void) => {
    const matchId = unoVoiceLeave(socket.id);
    if (matchId) {
      socket.to(UNO_ROOM(matchId)).emit('uno:voice-peer-left' as any, { socketId: socket.id });
    }
    cb?.(ok(null));
  });

  // ── voice: WebRTC signalling relay ────────────────────────────────────
  socket.on('uno:voice-offer' as any, (data: { to: string; sdp: any }) => {
    io.to(data.to).emit('uno:voice-offer' as any, { from: socket.id, sdp: data.sdp });
  });

  socket.on('uno:voice-answer' as any, (data: { to: string; sdp: any }) => {
    io.to(data.to).emit('uno:voice-answer' as any, { from: socket.id, sdp: data.sdp });
  });

  socket.on('uno:voice-ice' as any, (data: { to: string; candidate: any }) => {
    io.to(data.to).emit('uno:voice-ice' as any, { from: socket.id, candidate: data.candidate });
  });

  // ── PTT state ─────────────────────────────────────────────────────────
  socket.on('uno:ptt-start' as any, (data: { matchId: string }) => {
    const m = getMatch(String(data?.matchId));
    if (!m) return;
    const player = m.players.find(p => p.socketId === socket.id);
    if (!player) return;
    socket.to(UNO_ROOM(data.matchId)).emit('uno:ptt-state' as any, { socketId: socket.id, speaking: true });
  });

  socket.on('uno:ptt-stop' as any, (data: { matchId: string }) => {
    socket.to(UNO_ROOM(String(data?.matchId))).emit('uno:ptt-state' as any, { socketId: socket.id, speaking: false });
  });
}

// ── Disconnect cleanup ────────────────────────────────────────────────────────
export function handleUnoDisconnect(io: AppServer, socketId: string): void {
  // Voice cleanup
  const voiceMatchId = unoVoiceGetMatchId(socketId);
  if (voiceMatchId) {
    unoVoiceLeave(socketId);
    io.to(UNO_ROOM(voiceMatchId)).emit('uno:voice-peer-left' as any, { socketId });
    io.to(UNO_ROOM(voiceMatchId)).emit('uno:ptt-state' as any, { socketId, speaking: false });
  }

  const matchId = disconnectSocket(socketId);
  if (matchId) {
    const m = getMatch(matchId);
    if (m) broadcastState(io, matchId);
  }
}
