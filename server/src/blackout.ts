/**
 * Blackout socket handlers + timers (lights cycle, meeting countdown).
 * Follows the UNO socket-module conventions.
 */
import { Server, Socket } from 'socket.io';
import {
  ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData,
  ok, err,
} from './types/index.js';
import {
  createMatch, getMatch, getMatchByCode, listMatches,
  joinMatch, leaveMatch, startMatch, toggleLights, move, kill, report, vote,
  endMeeting, rematch, sendChat, disconnectSocket, getSafeState,
  sabotage, emergency, hackDoor,
} from './services/blackoutService.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const ROOM = (id: string) => `blackout:${id}`;

function userId(socket: AppSocket): string {
  return socket.data.profileId ?? socket.id;
}

function broadcastState(io: AppServer, matchId: string): void {
  const m = getMatch(matchId);
  if (!m) return;
  for (const player of m.players) {
    const s = io.sockets.sockets.get(player.socketId);
    if (s) s.emit('blackout:state' as any, getSafeState(m, player.userId));
  }
}

function broadcastList(io: AppServer): void {
  io.emit('blackout:list_update' as any, listMatches());
}

// ── Timers (token-guarded, like www.ts) ──────────────────────────────────
const lightsTimers = new Map<string, NodeJS.Timeout>();
const meetingTimers = new Map<string, NodeJS.Timeout>();

function clearTimers(matchId: string): void {
  const lt = lightsTimers.get(matchId);
  if (lt) { clearTimeout(lt); lightsTimers.delete(matchId); }
  const mt = meetingTimers.get(matchId);
  if (mt) { clearTimeout(mt); meetingTimers.delete(matchId); }
}

function scheduleLights(io: AppServer, matchId: string): void {
  const existing = lightsTimers.get(matchId);
  if (existing) clearTimeout(existing);
  const m = getMatch(matchId);
  if (!m || m.status !== 'play') return;
  const token = m.lightsChangeAt;
  const t = setTimeout(() => {
    lightsTimers.delete(matchId);
    const cur = getMatch(matchId);
    if (!cur || cur.status !== 'play' || cur.lightsChangeAt !== token) return; // stale
    toggleLights(matchId);
    broadcastState(io, matchId);
    scheduleLights(io, matchId);
  }, Math.max(0, token - Date.now()));
  lightsTimers.set(matchId, t);
}

function scheduleMeetingEnd(io: AppServer, matchId: string): void {
  const existing = meetingTimers.get(matchId);
  if (existing) clearTimeout(existing);
  const m = getMatch(matchId);
  if (!m || m.status !== 'meeting' || !m.meeting) return;
  const token = m.meeting.endsAt;
  const t = setTimeout(() => {
    meetingTimers.delete(matchId);
    const cur = getMatch(matchId);
    if (!cur || cur.status !== 'meeting' || cur.meeting?.endsAt !== token) return; // stale
    finishMeeting(io, matchId);
  }, Math.max(0, token - Date.now()));
  meetingTimers.set(matchId, t);
}

function finishMeeting(io: AppServer, matchId: string): void {
  const mt = meetingTimers.get(matchId);
  if (mt) { clearTimeout(mt); meetingTimers.delete(matchId); }
  const m = endMeeting(matchId);
  if (!m) return;
  broadcastState(io, matchId);
  if (m.status === 'play') scheduleLights(io, matchId);
  else if (m.status === 'finished') clearTimers(matchId);
}

// ── Handlers ─────────────────────────────────────────────────────────────
export function registerBlackoutHandlers(io: AppServer, socket: AppSocket): void {
  const uid = () => userId(socket);

  socket.on('blackout:list' as any, (cb: (r: any) => void) => {
    try { cb(ok(listMatches())); } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('blackout:create' as any, (data: { nickname?: string; maxPlayers?: number }, cb: (r: any) => void) => {
    try {
      const nickname = String(data?.nickname ?? 'Host').trim().slice(0, 24) || 'Host';
      const m = createMatch(uid(), socket.id, nickname, { maxPlayers: Number(data?.maxPlayers ?? 8) });
      socket.join(ROOM(m.id));
      broadcastList(io);
      cb(ok(getSafeState(m, uid())));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('blackout:join' as any, (data: { code: string; nickname?: string }, cb: (r: any) => void) => {
    try {
      const code = String(data?.code ?? '').trim().toUpperCase();
      const nickname = String(data?.nickname ?? 'Player').trim().slice(0, 24) || 'Player';
      const m = getMatchByCode(code);
      if (!m) return cb(err('Match not found'));
      const result = joinMatch(m.id, uid(), socket.id, nickname);
      if (!result) return cb(err('Cannot join — match full or already started'));
      socket.join(ROOM(m.id));
      if (result.isNew) broadcastState(io, m.id);
      broadcastList(io);
      cb(ok(getSafeState(result.match, uid())));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('blackout:leave' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try {
      const matchId = String(data?.matchId);
      const m = leaveMatch(matchId, uid());
      socket.leave(ROOM(matchId));
      if (m) {
        broadcastState(io, matchId);
        if (m.status === 'finished') clearTimers(matchId);
      } else {
        clearTimers(matchId);
      }
      broadcastList(io);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('blackout:start' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try {
      const m = startMatch(String(data?.matchId), uid());
      if (!m) return cb(err('Cannot start — need at least 4 players'));
      broadcastState(io, m.id);
      broadcastList(io);
      scheduleLights(io, m.id);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  // Fire-and-forget position relay (~12Hz per client)
  socket.on('blackout:move' as any, (data: { x: number; y: number }) => {
    const r = move(socket.id, Number(data?.x), Number(data?.y));
    if (!r) return;
    socket.to(ROOM(r.matchId)).emit('blackout:pos' as any, { u: r.userId, x: Math.round(r.x), y: Math.round(r.y) });
  });

  socket.on('blackout:kill' as any, (data: { matchId: string; targetId: string }, cb: (r: any) => void) => {
    try {
      const matchId = String(data?.matchId);
      const result = kill(matchId, uid(), String(data?.targetId));
      if ('error' in result) return cb(err(result.error));
      broadcastState(io, matchId);
      if (result.match.status === 'finished') { clearTimers(matchId); broadcastList(io); }
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('blackout:sabotage' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try {
      const matchId = String(data?.matchId);
      const result = sabotage(matchId, uid());
      if ('error' in result) return cb(err(result.error));
      broadcastState(io, matchId);
      scheduleLights(io, matchId); // lightsChangeAt moved — reschedule with the new token
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('blackout:emergency' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try {
      const matchId = String(data?.matchId);
      const result = emergency(matchId, uid());
      if ('error' in result) return cb(err(result.error));
      const lt = lightsTimers.get(matchId);
      if (lt) { clearTimeout(lt); lightsTimers.delete(matchId); }
      broadcastState(io, matchId);
      scheduleMeetingEnd(io, matchId);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('blackout:hack-door' as any, (data: { matchId: string; doorId: string }, cb: (r: any) => void) => {
    try {
      const matchId = String(data?.matchId);
      const result = hackDoor(matchId, uid(), String(data?.doorId));
      if ('error' in result) return cb(err(result.error));
      broadcastState(io, matchId);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('blackout:report' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try {
      const matchId = String(data?.matchId);
      const result = report(matchId, uid());
      if ('error' in result) return cb(err(result.error));
      // Freeze the lights cycle during the meeting
      const lt = lightsTimers.get(matchId);
      if (lt) { clearTimeout(lt); lightsTimers.delete(matchId); }
      broadcastState(io, matchId);
      scheduleMeetingEnd(io, matchId);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('blackout:vote' as any, (data: { matchId: string; targetId: string }, cb: (r: any) => void) => {
    try {
      const matchId = String(data?.matchId);
      const result = vote(matchId, uid(), String(data?.targetId));
      if ('error' in result) return cb(err(result.error));
      if (result.allVoted) finishMeeting(io, matchId);
      else broadcastState(io, matchId);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('blackout:rematch' as any, (data: { matchId: string }, cb: (r: any) => void) => {
    try {
      const m = rematch(String(data?.matchId), uid());
      if (!m) return cb(err('Cannot rematch'));
      broadcastState(io, m.id);
      broadcastList(io);
      cb(ok(null));
    } catch (e: any) { cb(err(e.message)); }
  });

  socket.on('blackout:chat' as any, (data: { matchId: string; text: string; nickname: string }) => {
    try {
      const result = sendChat(String(data?.matchId), uid(), String(data?.nickname ?? 'Player').slice(0, 24), String(data?.text ?? ''));
      if (!result) return;
      io.to(ROOM(result.match.id)).emit('blackout:chat' as any, result.msg);
    } catch { /* ignore */ }
  });
}

// ── Disconnect cleanup ───────────────────────────────────────────────────
export function handleBlackoutDisconnect(io: AppServer, socketId: string): void {
  const matchId = disconnectSocket(socketId);
  if (!matchId) return;
  const m = getMatch(matchId);
  if (m) {
    broadcastState(io, matchId);
    if (m.status === 'finished') clearTimers(matchId);
  } else {
    clearTimers(matchId);
  }
  broadcastList(io);
}
