const { findUserById, getOrCreateGuest } = require('./services/userService');

function attachSocketServer(io, ctx) {
  const user = s => s.data.user;
  const roomOf = id => ctx.rooms.get(String(id));
  const bySocket = (r, sid) => r?.players.find(p => p.socketId === sid);
  const asUserId = s => user(s)?.userId;

  io.on('connection', socket => {
    socket.on('auth', async (p = {}, cb) => {
      try {
        const u = p.userId ? await findUserById(ctx, p.userId) : await getOrCreateGuest(ctx, p);
        if (!u || u.isBanned) throw Error('Access denied');
        socket.data.user = u;
        ctx.onlineUsers.set(String(u.userId), { socketId: socket.id, user: u });
        cb && cb({ ok: true, user: u });
        ctx.engine.publishRooms();
      } catch (e) { cb && cb({ ok: false, error: e.message }); }
    });

    socket.on('room:create', (p = {}, cb) => {
      try {
        const u = user(socket) || p.user;
        const r = ctx.engine.createRoom({ name: p.name, host: u, settings: p.settings });
        const pl = r.players.find(x => x.userId === u.userId); if (pl) pl.socketId = socket.id;
        socket.join(r.id); ctx.socketRooms.set(socket.id, r.id);
        cb && cb({ ok: true, room: ctx.engine.publicRoom(r, u.userId) }); ctx.engine.roomState(r);
      } catch (e) { cb && cb({ ok: false, error: e.message }); }
    });

    socket.on('room:join', (p = {}, cb) => {
      try {
        const u = user(socket) || p.user;
        const x = ctx.engine.joinRoom(p.roomId, u, socket.id, !!p.spectator);
        socket.join(x.room.id); ctx.socketRooms.set(socket.id, x.room.id);
        cb && cb({ ok: true, spectator: x.spectator, room: ctx.engine.publicRoom(x.room, u.userId) }); ctx.engine.roomState(x.room);
      } catch (e) { cb && cb({ ok: false, error: e.message }); }
    });

    socket.on('room:leave', (p = {}, cb) => {
      try { const r = roomOf(p.roomId || ctx.socketRooms.get(socket.id)); if (!r) throw Error('Room not found'); const status = ctx.engine.leaveRoom(r, asUserId(socket), socket.id); socket.leave(r.id); ctx.socketRooms.delete(socket.id); cb && cb({ ok: true, status }); }
      catch (e) { cb && cb({ ok: false, error: e.message }); }
    });
    socket.on('room:settings', (p = {}, cb) => { try { const r = roomOf(p.roomId); ctx.engine.updateSettings(r, p.settings || {}, asUserId(socket) || p.userId); cb && cb({ ok: true }); } catch (e) { cb && cb({ ok: false, error: e.message }); } });
    socket.on('game:start', (p = {}, cb) => { try { const r = roomOf(p.roomId); ctx.engine.start(r, asUserId(socket) || p.userId); cb && cb({ ok: true }); } catch (e) { cb && cb({ ok: false, error: e.message }); } });
    socket.on('game:next', async (p = {}, cb) => { try { const r = roomOf(p.roomId); if (Number(r.hostUserId) !== Number(asUserId(socket))) throw Error('Host only'); await ctx.engine.nextPhase(r); cb && cb({ ok: true }); } catch (e) { cb && cb({ ok: false, error: e.message }); } });
    socket.on('game:action', (p = {}, cb) => { try { const r = roomOf(p.roomId); const res = ctx.engine.action(r, bySocket(r, socket.id), p.targetId); cb && cb(res); ctx.engine.roomState(r); } catch (e) { cb && cb({ ok: false, error: e.message }); } });
    socket.on('game:nominate', (p = {}, cb) => { try { const r = roomOf(p.roomId); const res = ctx.engine.nominate(r, bySocket(r, socket.id), p.targetId); cb && cb(res); ctx.engine.roomState(r); } catch (e) { cb && cb({ ok: false, error: e.message }); } });
    socket.on('game:vote', (p = {}, cb) => { try { const r = roomOf(p.roomId); const res = ctx.engine.vote(r, bySocket(r, socket.id), p.targetId); cb && cb(res); ctx.engine.roomState(r); } catch (e) { cb && cb({ ok: false, error: e.message }); } });
    socket.on('host:warn', (p = {}, cb) => { try { const r = roomOf(p.roomId); ctx.engine.warn(r, asUserId(socket), p.targetUserId, p.reason); cb && cb({ ok: true }); } catch (e) { cb && cb({ ok: false, error: e.message }); } });

    socket.on('chat:send', (p = {}, cb) => {
      try {
        const r = roomOf(p.roomId), pl = bySocket(r, socket.id), sp = r?.spectators.find(s => s.socketId === socket.id), sender = pl || sp || user(socket);
        if (!sender) throw Error('Not in room');
        const msg = ctx.engine.chat(r, sender, p.message, p.channel || 'room');
        if (msg.channel === 'mafia') r.players.filter(x => x.team === 'mafia').forEach(x => x.socketId && io.to(x.socketId).emit('chat:message', msg));
        else io.to(r.id).emit('chat:message', msg);
        cb && cb({ ok: true, msg });
      } catch (e) { cb && cb({ ok: false, error: e.message }); }
    });

    socket.on('media:state', p => { const r = roomOf(p.roomId); if (!r) return; const pl = bySocket(r, socket.id); if (!pl) return; ['micOn','cameraOn','speaking'].forEach(k => { if (typeof p[k] === 'boolean') pl[k] = p[k]; }); ctx.engine.roomState(r); });
    socket.on('webrtc:ready', p => { const r = roomOf(p.roomId); if (!r) return; socket.to(r.id).emit('webrtc:peer-ready', { socketId: socket.id, userId: asUserId(socket) }); });
    socket.on('webrtc:reset', p => { const r = roomOf(p.roomId); if (!r) return; socket.to(r.id).emit('webrtc:reset-peer', { socketId: socket.id }); });
    socket.on('signal:offer', ({ to, signal }) => io.to(to).emit('signal:offer', { from: socket.id, signal }));
    socket.on('signal:answer', ({ to, signal }) => io.to(to).emit('signal:answer', { from: socket.id, signal }));
    socket.on('signal:ice', ({ to, candidate }) => io.to(to).emit('signal:ice', { from: socket.id, candidate }));

    socket.on('disconnect', () => {
      const u = user(socket); if (u) ctx.onlineUsers.delete(String(u.userId));
      const rid = ctx.socketRooms.get(socket.id); ctx.socketRooms.delete(socket.id);
      const r = rid && roomOf(rid); if (r) ctx.engine.leaveRoom(r, u?.userId, socket.id);
    });
  });

  setInterval(() => {
    for (const r of ctx.rooms.values()) {
      if (!['waiting', 'ended'].includes(r.phase)) {
        r.timer = Math.max(0, Number(r.timer || 0) - 1);
        if (r.timer <= 0) ctx.engine.nextPhase(r).catch(err => console.error('phase error:', err.message));
        else ctx.engine.roomState(r);
      }
    }
  }, 1000);
}
module.exports = { attachSocketServer };
