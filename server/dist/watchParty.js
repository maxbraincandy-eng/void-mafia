import { ok, err, } from './types/index.js';
import { createMatch, getMatch, getMatchByCode, listMatches, joinMatch, leaveMatch, transferHost, setSource, play, pause, seek, setRate, queueAdd, queueRemove, queueNext, addChat, findBySocket, getSafeState, } from './services/watchPartyService.js';
const ROOM = (id) => `wp:${id}`;
function uid(socket) { return socket.data.profileId ?? socket.id; }
function broadcastState(io, matchId) {
    const m = getMatch(matchId);
    if (!m)
        return;
    for (const member of m.members) {
        const s = io.sockets.sockets.get(member.socketId);
        if (s)
            s.emit('wp:state', getSafeState(m, member.userId));
    }
}
function broadcastList(io) { io.emit('wp:list_update', listMatches()); }
function identity(socket, data) {
    const name = String(data?.nickname ?? data?.name ?? 'Guest').trim().slice(0, 24) || 'Guest';
    const avatar = String(data?.avatar ?? '🎬').slice(0, 8);
    return { name, avatar };
}
export function registerWatchPartyHandlers(io, socket) {
    const emit = (cb, r) => { if (typeof cb === 'function')
        cb(r); };
    // ── Lobby ──────────────────────────────────────────────────────────
    socket.on('wp:list', (cb) => emit(cb, ok(listMatches())));
    socket.on('wp:create', (data, cb) => {
        const { name, avatar } = identity(socket, data);
        const title = String(data?.title ?? '').trim().slice(0, 60);
        const m = createMatch(uid(socket), socket.id, name, avatar, title);
        socket.join(ROOM(m.id));
        emit(cb, ok({ matchId: m.id, code: m.code }));
        broadcastState(io, m.id);
        broadcastList(io);
    });
    socket.on('wp:join', (data, cb) => {
        const found = data?.code ? getMatchByCode(String(data.code)) : (data?.matchId ? getMatch(String(data.matchId)) : undefined);
        if (!found)
            return emit(cb, err('Room not found.'));
        const { name, avatar } = identity(socket, data);
        const m = joinMatch(found.id, uid(socket), socket.id, name, avatar);
        if (!m)
            return emit(cb, err('Could not join.'));
        socket.join(ROOM(m.id));
        emit(cb, ok({ matchId: m.id, code: m.code }));
        broadcastState(io, m.id);
        broadcastList(io);
    });
    socket.on('wp:leave', (data, cb) => {
        const matchId = String(data?.matchId ?? '');
        const m = getMatch(matchId);
        if (m) {
            socket.leave(ROOM(matchId));
            const { dissolved } = leaveMatch(matchId, uid(socket));
            if (!dissolved)
                broadcastState(io, matchId);
            broadcastList(io);
        }
        emit(cb, ok(true));
    });
    socket.on('wp:transfer_host', (data, cb) => {
        const m = transferHost(String(data?.matchId ?? ''), uid(socket), String(data?.targetUserId ?? ''));
        if (!m)
            return emit(cb, err('Cannot transfer host.'));
        emit(cb, ok(true));
        broadcastState(io, m.id);
        broadcastList(io);
    });
    // ── Playback control (host-only; enforced in the service) ──────────
    const control = (m, cb) => {
        if (!m)
            return emit(cb, err('Not allowed.'));
        emit(cb, ok(true));
        broadcastState(io, m.id);
        broadcastList(io);
    };
    socket.on('wp:set_source', (data, cb) => control(setSource(String(data?.matchId ?? ''), uid(socket), String(data?.url ?? '')), cb));
    socket.on('wp:play', (data, cb) => control(play(String(data?.matchId ?? ''), uid(socket), typeof data?.positionSec === 'number' ? data.positionSec : undefined), cb));
    socket.on('wp:pause', (data, cb) => control(pause(String(data?.matchId ?? ''), uid(socket), typeof data?.positionSec === 'number' ? data.positionSec : undefined), cb));
    socket.on('wp:seek', (data, cb) => control(seek(String(data?.matchId ?? ''), uid(socket), Number(data?.positionSec)), cb));
    socket.on('wp:rate', (data, cb) => control(setRate(String(data?.matchId ?? ''), uid(socket), Number(data?.rate)), cb));
    // ── Queue ──────────────────────────────────────────────────────────
    socket.on('wp:queue_add', (data, cb) => control(queueAdd(String(data?.matchId ?? ''), uid(socket), String(data?.url ?? '')), cb));
    socket.on('wp:queue_remove', (data, cb) => control(queueRemove(String(data?.matchId ?? ''), uid(socket), Number(data?.index)), cb));
    socket.on('wp:queue_next', (data, cb) => control(queueNext(String(data?.matchId ?? ''), uid(socket)), cb));
    // ── Chat ───────────────────────────────────────────────────────────
    socket.on('wp:chat', (data, cb) => {
        const res = addChat(String(data?.matchId ?? ''), uid(socket), String(data?.text ?? ''));
        if (!res)
            return emit(cb, err('Could not send.'));
        io.to(ROOM(res.m.id)).emit('wp:chat_new', res.msg);
        emit(cb, ok(true));
    });
    // ── Drift correction: a viewer asks for the authoritative state ────
    socket.on('wp:sync', (data, cb) => {
        const m = getMatch(String(data?.matchId ?? ''));
        if (!m)
            return emit(cb, err('Room not found.'));
        emit(cb, ok(getSafeState(m, uid(socket))));
    });
}
export function handleWatchPartyDisconnect(io, socketId) {
    const m = findBySocket(socketId);
    if (!m)
        return;
    const member = m.members.find(x => x.socketId === socketId);
    if (!member)
        return;
    const matchId = m.id;
    const { dissolved } = leaveMatch(matchId, member.userId);
    if (!dissolved)
        broadcastState(io, matchId);
    broadcastList(io);
}
//# sourceMappingURL=watchParty.js.map