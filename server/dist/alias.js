import { ok, err, } from './types/index.js';
import { createMatch, getMatch, getMatchByCode, listMatches, joinMatch, switchTeam, leaveMatch, dissolveMatch, startMatch, startTurn, markWord, endTurn, rematch, disconnectSocket, getSafeState, resumeForUser, } from './services/aliasService.js';
import { emitToPlayers } from './lib/liveSocket.js';
const ROOM = (id) => `alias:${id}`;
function userId(socket) { return socket.data.profileId ?? socket.id; }
function broadcastState(io, matchId) {
    const m = getMatch(matchId);
    if (!m)
        return;
    // Resolved by identity so a reconnected player keeps receiving state — see
    // lib/liveSocket.
    emitToPlayers(io, m.players, 'alias:state', p => getSafeState(m, p.userId), (p, sid) => {
        p.socketId = sid;
        p.connected = true;
    });
}
function broadcastList(io) { io.emit('alias:list_update', listMatches()); }
const turnTimers = new Map();
function clearTurnTimer(id) { const t = turnTimers.get(id); if (t) {
    clearTimeout(t);
    turnTimers.delete(id);
} }
function scheduleTurnEnd(io, matchId) {
    clearTurnTimer(matchId);
    const m = getMatch(matchId);
    if (!m || m.status !== 'play' || !m.turn)
        return;
    const token = m.turn.endsAt;
    const t = setTimeout(() => {
        turnTimers.delete(matchId);
        const cur = getMatch(matchId);
        if (!cur || cur.status !== 'play' || cur.turn?.endsAt !== token)
            return; // stale
        endTurn(matchId);
        broadcastState(io, matchId);
    }, Math.max(0, token - Date.now()));
    turnTimers.set(matchId, t);
}
export function registerAliasHandlers(io, socket) {
    const uid = () => userId(socket);
    socket.on('alias:list', (cb) => { try {
        cb(ok(listMatches()));
    }
    catch (e) {
        cb(err(e.message));
    } });
    socket.on('alias:create', (data, cb) => {
        try {
            const nickname = String(data?.nickname ?? 'Host').trim().slice(0, 24) || 'Host';
            const m = createMatch(uid(), socket.id, nickname, { maxPlayers: Number(data?.maxPlayers ?? 8), targetScore: Number(data?.targetScore ?? 30), roundSeconds: Number(data?.roundSeconds ?? 60) });
            socket.join(ROOM(m.id));
            broadcastList(io);
            cb(ok(getSafeState(m, uid())));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('alias:join', (data, cb) => {
        try {
            const code = String(data?.code ?? '').trim().toUpperCase();
            const nickname = String(data?.nickname ?? 'Player').trim().slice(0, 24) || 'Player';
            const m = getMatchByCode(code);
            if (!m)
                return cb(err('Match not found'));
            const result = joinMatch(m.id, uid(), socket.id, nickname);
            if (!result)
                return cb(err('Cannot join — full or already started'));
            socket.join(ROOM(m.id));
            if (result.isNew)
                broadcastState(io, m.id);
            broadcastList(io);
            cb(ok(getSafeState(result.match, uid())));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('alias:switch_team', (data, cb) => {
        try {
            const m = switchTeam(String(data?.matchId), uid());
            if (!m)
                return cb(err('Cannot switch'));
            broadcastState(io, m.id);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    /** Back after a drop or a reload — see lies.ts for the reasoning. */
    socket.on('alias:resume', (cb) => {
        try {
            const m = resumeForUser(uid(), socket.id);
            if (!m)
                return cb(ok(null));
            socket.join(ROOM(m.id));
            broadcastState(io, m.id);
            cb(ok(getSafeState(m, uid())));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('alias:leave', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const cur = getMatch(matchId);
            const active = cur && cur.status !== 'waiting' && cur.status !== 'finished';
            // The host walking out closes the table — in the lobby too. A room whose
            // host has left is a room nobody can start, and it was still being
            // advertised as open.
            const close = active || cur?.hostId === uid();
            const m = close ? dissolveMatch(matchId, uid()) : leaveMatch(matchId, uid());
            socket.leave(ROOM(matchId));
            if (close)
                clearTurnTimer(matchId);
            if (m) {
                broadcastState(io, matchId);
                if (!close && m.turn)
                    scheduleTurnEnd(io, matchId);
            }
            else
                clearTurnTimer(matchId);
            broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('alias:start', (data, cb) => {
        try {
            const m = startMatch(String(data?.matchId), uid());
            if (!m)
                return cb(err('Cannot start — need at least 1 player per team'));
            broadcastState(io, m.id);
            broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('alias:start_turn', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = startTurn(matchId, uid());
            if (!m)
                return cb(err('Not your turn'));
            broadcastState(io, matchId);
            scheduleTurnEnd(io, matchId);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('alias:mark', (data, cb) => {
        try {
            const matchId = String(data?.matchId);
            const m = markWord(matchId, uid(), !!data?.got);
            if (!m)
                return cb(err('Cannot mark'));
            broadcastState(io, matchId);
            if (m.status === 'finished') {
                clearTurnTimer(matchId);
                broadcastList(io);
            }
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    socket.on('alias:rematch', (data, cb) => {
        try {
            const m = rematch(String(data?.matchId), uid());
            if (!m)
                return cb(err('Cannot rematch'));
            broadcastState(io, m.id);
            broadcastList(io);
            cb(ok(null));
        }
        catch (e) {
            cb(err(e.message));
        }
    });
    // Simple in-game guess chat (guessers shout here if not on voice).
    socket.on('alias:guess', (data) => {
        try {
            const m = getMatch(String(data?.matchId));
            if (!m)
                return;
            const p = m.players.find(pl => pl.userId === uid());
            if (!p)
                return;
            const text = String(data?.text ?? '').trim().slice(0, 60);
            if (!text)
                return;
            io.to(ROOM(m.id)).emit('alias:guess', { nickname: p.nickname, team: p.team, text, ts: Date.now() });
        }
        catch { /* ignore */ }
    });
}
export function handleAliasDisconnect(io, socketId) {
    const matchId = disconnectSocket(socketId);
    if (!matchId)
        return;
    const m = getMatch(matchId);
    if (m)
        broadcastState(io, matchId);
    broadcastList(io);
}
//# sourceMappingURL=alias.js.map