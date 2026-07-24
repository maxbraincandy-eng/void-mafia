/**
 * Watch Party — socket handlers (`wp:*` events).
 *
 * Standalone co-watching rooms. The host drives playback and the server holds
 * the authoritative position, so every viewer stays in sync and late joiners
 * jump to the current moment. Voice/video is the shared LiveKit room on the
 * client (`watchparty_<matchId>`); no media code here. Mirrors the
 * lies/spyfall/sxvaMafia socket-module conventions.
 */
import { Server, Socket } from 'socket.io';
import {
  ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData, ok, err,
} from './types/index.js';
import {
  createMatch, getMatch, getMatchByCode, listMatches, joinMatch, leaveMatch,
  transferHost, setSource, play, pause, seek, setRate,
  queueAdd, queueRemove, queueNext, addChat, findBySocket, getSafeState,
  type WpMatch,
} from './services/watchPartyService.js';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const ROOM = (id: string) => `wp:${id}`;
function uid(socket: AppSocket): string { return socket.data.profileId ?? socket.id; }

function broadcastState(io: AppServer, matchId: string): void {
  const m = getMatch(matchId);
  if (!m) return;
  for (const member of m.members) {
    const s = io.sockets.sockets.get(member.socketId);
    if (s) s.emit('wp:state' as any, getSafeState(m, member.userId));
  }
}
function broadcastList(io: AppServer): void { io.emit('wp:list_update' as any, listMatches()); }

function identity(socket: AppSocket, data: any): { name: string; avatar: string } {
  const name = String(data?.nickname ?? data?.name ?? 'Guest').trim().slice(0, 24) || 'Guest';
  const avatar = String(data?.avatar ?? '🎬').slice(0, 8);
  return { name, avatar };
}

export function registerWatchPartyHandlers(io: AppServer, socket: AppSocket): void {
  const emit = (cb: any, r: any) => { if (typeof cb === 'function') cb(r); };

  // ── Lobby ──────────────────────────────────────────────────────────
  socket.on('wp:list' as any, (cb: any) => emit(cb, ok(listMatches())));

  socket.on('wp:create' as any, (data: any, cb: any) => {
    const { name, avatar } = identity(socket, data);
    const title = String(data?.title ?? '').trim().slice(0, 60);
    const m = createMatch(uid(socket), socket.id, name, avatar, title);
    socket.join(ROOM(m.id));
    emit(cb, ok({ matchId: m.id, code: m.code }));
    broadcastState(io, m.id);
    broadcastList(io);
  });

  socket.on('wp:join' as any, (data: any, cb: any) => {
    const found = data?.code ? getMatchByCode(String(data.code)) : (data?.matchId ? getMatch(String(data.matchId)) : undefined);
    if (!found) return emit(cb, err('Room not found.'));
    const { name, avatar } = identity(socket, data);
    const m = joinMatch(found.id, uid(socket), socket.id, name, avatar);
    if (!m) return emit(cb, err('Could not join.'));
    socket.join(ROOM(m.id));
    emit(cb, ok({ matchId: m.id, code: m.code }));
    broadcastState(io, m.id);
    broadcastList(io);
  });

  socket.on('wp:leave' as any, (data: any, cb: any) => {
    const matchId = String(data?.matchId ?? '');
    const m = getMatch(matchId);
    if (m) {
      socket.leave(ROOM(matchId));
      const { dissolved } = leaveMatch(matchId, uid(socket));
      if (!dissolved) broadcastState(io, matchId);
      broadcastList(io);
    }
    emit(cb, ok(true));
  });

  socket.on('wp:transfer_host' as any, (data: any, cb: any) => {
    const m = transferHost(String(data?.matchId ?? ''), uid(socket), String(data?.targetUserId ?? ''));
    if (!m) return emit(cb, err('Cannot transfer host.'));
    emit(cb, ok(true));
    broadcastState(io, m.id);
    broadcastList(io);
  });

  // ── Playback control (host-only; enforced in the service) ──────────
  const control = (m: WpMatch | null, cb: any) => {
    if (!m) return emit(cb, err('Not allowed.'));
    emit(cb, ok(true));
    broadcastState(io, m.id);
    broadcastList(io);
  };

  socket.on('wp:set_source' as any, (data: any, cb: any) =>
    control(setSource(String(data?.matchId ?? ''), uid(socket), String(data?.url ?? '')), cb));

  socket.on('wp:play' as any, (data: any, cb: any) =>
    control(play(String(data?.matchId ?? ''), uid(socket), typeof data?.positionSec === 'number' ? data.positionSec : undefined), cb));

  socket.on('wp:pause' as any, (data: any, cb: any) =>
    control(pause(String(data?.matchId ?? ''), uid(socket), typeof data?.positionSec === 'number' ? data.positionSec : undefined), cb));

  socket.on('wp:seek' as any, (data: any, cb: any) =>
    control(seek(String(data?.matchId ?? ''), uid(socket), Number(data?.positionSec)), cb));

  socket.on('wp:rate' as any, (data: any, cb: any) =>
    control(setRate(String(data?.matchId ?? ''), uid(socket), Number(data?.rate)), cb));

  // ── Queue ──────────────────────────────────────────────────────────
  socket.on('wp:queue_add' as any, (data: any, cb: any) =>
    control(queueAdd(String(data?.matchId ?? ''), uid(socket), String(data?.url ?? '')), cb));

  socket.on('wp:queue_remove' as any, (data: any, cb: any) =>
    control(queueRemove(String(data?.matchId ?? ''), uid(socket), Number(data?.index)), cb));

  socket.on('wp:queue_next' as any, (data: any, cb: any) =>
    control(queueNext(String(data?.matchId ?? ''), uid(socket)), cb));

  // ── Chat ───────────────────────────────────────────────────────────
  socket.on('wp:chat' as any, (data: any, cb: any) => {
    const res = addChat(String(data?.matchId ?? ''), uid(socket), String(data?.text ?? ''));
    if (!res) return emit(cb, err('Could not send.'));
    io.to(ROOM(res.m.id)).emit('wp:chat_new' as any, res.msg);
    emit(cb, ok(true));
  });

  // ── Drift correction: a viewer asks for the authoritative state ────
  socket.on('wp:sync' as any, (data: any, cb: any) => {
    const m = getMatch(String(data?.matchId ?? ''));
    if (!m) return emit(cb, err('Room not found.'));
    emit(cb, ok(getSafeState(m, uid(socket))));
  });
}

export function handleWatchPartyDisconnect(io: AppServer, socketId: string): void {
  const m = findBySocket(socketId);
  if (!m) return;
  const member = m.members.find(x => x.socketId === socketId);
  if (!member) return;
  const matchId = m.id;
  const { dissolved } = leaveMatch(matchId, member.userId);
  if (!dissolved) broadcastState(io, matchId);
  broadcastList(io);
}
