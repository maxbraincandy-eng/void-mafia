const { getOrCreateGuest, findUserById } = require("./services/userService");
const { GameEngine, publicRoom } = require("./services/gameEngine");

function attachSocketServer(io, ctx) {
  if (!ctx.engine) {
    ctx.engine = new GameEngine(ctx);
  }

  if (!ctx.rooms) ctx.rooms = new Map();
  if (!ctx.onlineUsers) ctx.onlineUsers = new Map();
  if (!ctx.socketRooms) ctx.socketRooms = new Map();

  const user = socket => socket.data.user;
  const roomOf = id => ctx.rooms.get(String(id));
  const bySocket = (room, socketId) => room.players.find(p => p.socketId === socketId);

  io.on("connection", socket => {
    socket.on("auth", async (payload = {}, cb) => {
      try {
        const u = payload.userId
          ? await findUserById(ctx, payload.userId)
          : await getOrCreateGuest(ctx, payload);

        if (!u || u.isBanned) throw new Error("Access denied");

        socket.data.user = u;
        ctx.onlineUsers.set(String(u.userId), {
          socketId: socket.id,
          user: u
        });

        cb && cb({ ok: true, user: u });
      } catch (err) {
        cb && cb({ ok: false, error: err.message });
      }
    });

    socket.on("room:create", (payload = {}, cb) => {
      try {
        const u = user(socket) || payload.user;
        if (!u) throw new Error("Auth required");

        const room = ctx.engine.createRoom({
          name: payload.name,
          host: u,
          settings: payload.settings
        });

        room.players[0].socketId = socket.id;
        room.hostSocketId = socket.id;

        socket.join(room.id);
        ctx.socketRooms.set(socket.id, room.id);

        cb && cb({
          ok: true,
          room: publicRoom(room, u.userId)
        });

        ctx.engine.roomState(room);
        ctx.engine.publishRooms();
      } catch (err) {
        cb && cb({ ok: false, error: err.message });
      }
    });

    socket.on("room:join", (payload = {}, cb) => {
      try {
        const u = user(socket) || payload.user;
        if (!u) throw new Error("Auth required");

        const result = ctx.engine.joinRoom(
          payload.roomId,
          u,
          socket.id,
          !!payload.spectator
        );

        socket.join(result.room.id);
        ctx.socketRooms.set(socket.id, result.room.id);

        cb && cb({
          ok: true,
          spectator: result.spectator,
          room: publicRoom(result.room, u.userId)
        });

        ctx.engine.roomState(result.room);
        ctx.engine.publishRooms();
      } catch (err) {
        cb && cb({ ok: false, error: err.message });
      }
    });

    socket.on("room:leave", (payload = {}, cb) => {
      try {
        const roomId = payload.roomId || ctx.socketRooms.get(socket.id);
        const room = roomOf(roomId);
        if (!room) {
          cb && cb({ ok: true });
          return;
        }

        const u = user(socket);
        const player = bySocket(room, socket.id);

        socket.leave(room.id);
        ctx.socketRooms.delete(socket.id);

        if (player && Number(room.hostUserId) === Number(player.userId)) {
          ctx.engine.terminateRoom(room, "Host left. Room terminated.");
          cb && cb({ ok: true, terminated: true });
          return;
        }

        if (player) {
          room.players = room.players.filter(p => p.socketId !== socket.id);
          room.players.forEach((p, i) => {
            p.seat = i + 1;
          });
        }

        room.spectators = room.spectators.filter(s => s.socketId !== socket.id);

        cb && cb({ ok: true });
        ctx.engine.roomState(room);
        ctx.engine.publishRooms();
      } catch (err) {
        cb && cb({ ok: false, error: err.message });
      }
    });

    socket.on("room:settings", (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        const u = user(socket);

        ctx.engine.updateSettings(
          room,
          payload.settings,
          u?.userId || payload.userId
        );

        cb && cb({ ok: true });
      } catch (err) {
        cb && cb({ ok: false, error: err.message });
      }
    });

    socket.on("game:start", (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        const u = user(socket);

        ctx.engine.start(room, u?.userId || payload.userId);

        cb && cb({ ok: true });
      } catch (err) {
        cb && cb({ ok: false, error: err.message });
      }
    });

    socket.on("game:next", async (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        if (!room) throw new Error("Room not found");

        const u = user(socket);
        if (Number(room.hostUserId) !== Number(u?.userId)) {
          throw new Error("Host only");
        }

        await ctx.engine.nextPhase(room);

        cb && cb({ ok: true });
      } catch (err) {
        cb && cb({ ok: false, error: err.message });
      }
    });

    socket.on("game:action", (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        const actor = room && bySocket(room, socket.id);

        const res = ctx.engine.action(room, actor, payload.targetId);

        cb && cb(res);
        ctx.engine.roomState(room);
      } catch (err) {
        cb && cb({ ok: false, error: err.message });
      }
    });

    socket.on("game:nominate", (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        const actor = room && bySocket(room, socket.id);

        const res = ctx.engine.nominate(room, actor, payload.targetId);

        cb && cb(res);
        ctx.engine.roomState(room);
      } catch (err) {
        cb && cb({ ok: false, error: err.message });
      }
    });

    socket.on("game:vote", (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        const actor = room && bySocket(room, socket.id);

        const res = ctx.engine.vote(room, actor, payload.targetId);

        cb && cb(res);
        ctx.engine.roomState(room);
      } catch (err) {
        cb && cb({ ok: false, error: err.message });
      }
    });

    socket.on("chat:send", (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        if (!room) throw new Error("Room not found");

        const player = bySocket(room, socket.id);
        const spectator = room.spectators.find(s => s.socketId === socket.id);
        const sender = player || spectator || user(socket);

        if (!sender) throw new Error("Sender not found");

        const msg = ctx.engine.chat(
          room,
          sender,
          payload.message,
          payload.channel || "room"
        );

        if (msg.channel === "mafia") {
          room.players
            .filter(p => p.team === "mafia" && p.socketId)
            .forEach(p => {
              io.to(p.socketId).emit("chat:message", msg);
            });
        } else {
          io.to(room.id).emit("chat:message", msg);
        }

        cb && cb({ ok: true, msg });
      } catch (err) {
        cb && cb({
          ok: false,
          error: err.message || "Chat failed"
        });
      }
    });

    socket.on("media:state", payload => {
      const room = roomOf(payload.roomId);
      if (!room) return;

      const player = bySocket(room, socket.id);
      if (!player) return;

      if (typeof payload.micOn === "boolean") player.micOn = payload.micOn;
      if (typeof payload.cameraOn === "boolean") player.cameraOn = payload.cameraOn;
      if (typeof payload.speaking === "boolean") player.speaking = payload.speaking;

      ctx.engine.roomState(room);
    });

    socket.on("signal:offer", ({ to, signal }) => {
      if (!to || !signal) return;
      io.to(to).emit("signal:offer", {
        from: socket.id,
        signal
      });
    });

    socket.on("signal:answer", ({ to, signal }) => {
      if (!to || !signal) return;
      io.to(to).emit("signal:answer", {
        from: socket.id,
        signal
      });
    });

    socket.on("signal:ice", ({ to, candidate }) => {
      if (!to || !candidate) return;
      io.to(to).emit("signal:ice", {
        from: socket.id,
        candidate
      });
    });

    socket.on("disconnect", () => {
      const u = user(socket);

      if (u) {
        ctx.onlineUsers.delete(String(u.userId));
      }

      const roomId = ctx.socketRooms.get(socket.id);
      ctx.socketRooms.delete(socket.id);

      const room = roomId && roomOf(roomId);
      if (!room) return;

      const player = bySocket(room, socket.id);

      if (player && Number(room.hostUserId) === Number(player.userId)) {
        ctx.engine.terminateRoom(room, "Host disconnected. Room terminated.");
        return;
      }

      if (player) {
        player.connected = false;
        player.speaking = false;
        player.micOn = false;
        player.cameraOn = false;
        player.lastSeenAt = Date.now();
      }

      room.spectators = room.spectators.filter(s => s.socketId !== socket.id);

      ctx.engine.roomState(room);
      ctx.engine.publishRooms();
    });
  });

  setInterval(async () => {
    for (const room of ctx.rooms.values()) {
      if (room.phase === "waiting" || room.phase === "ended") continue;

      room.timer = Math.max(0, Number(room.timer || 0) - 1);

      if (room.timer <= 0 && room.settings.autoPhase !== false) {
        await ctx.engine.nextPhase(room);
      } else {
        ctx.engine.roomState(room);
      }
    }
  }, 1000);
}

module.exports = { attachSocketServer };