/* src/socket.js
   VOID MAFIA v16.2 socket fix
   Fixes:
   - room:leave
   - room:terminate when host leaves
   - chat callbacks never freeze frontend
   - WebRTC signaling kept simple
*/

const { getOrCreateGuest, findUserById } = require("./services/userService");
const { publicRoom } = require("./services/gameEngine");

function attachSocketServer(io, ctx) {
  const user = socket => socket.data.user;
  const roomOf = id => ctx.rooms.get(String(id));

  function bySocket(room, socketId) {
    if (!room) return null;
    return room.players.find(p => p.socketId === socketId);
  }

  function safeRoomState(room) {
    if (!room) return;
    ctx.engine.roomState(room);
    ctx.engine.publishRooms();
  }

  function terminateRoom(roomId) {
    const room = roomOf(roomId);
    if (!room) return false;

    io.to(room.id).emit("room:terminated", {
      roomId: room.id,
      message: "Host left. Room terminated."
    });

    ctx.rooms.delete(String(room.id));
    ctx.engine.publishRooms();

    return true;
  }

  io.on("connection", socket => {
    socket.on("auth", async (payload = {}, cb) => {
      try {
        const u = payload.userId
          ? await findUserById(ctx, payload.userId)
          : await getOrCreateGuest(ctx, payload);

        if (!u || u.isBanned) throw Error("Access denied");

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
        if (!u) throw Error("Not authorized");

        const room = ctx.engine.createRoom({
          name: payload.name,
          host: u,
          settings: payload.settings
        });

        room.players[0].socketId = socket.id;
        room.players[0].connected = true;

        socket.join(room.id);
        ctx.socketRooms.set(socket.id, room.id);

        cb && cb({ ok: true, room: publicRoom(room, u.userId) });
        safeRoomState(room);
      } catch (err) {
        cb && cb({ ok: false, error: err.message });
      }
    });

    socket.on("room:join", (payload = {}, cb) => {
      try {
        const u = user(socket) || payload.user;
        if (!u) throw Error("Not authorized");

        const joined = ctx.engine.joinRoom(
          payload.roomId,
          u,
          socket.id,
          !!payload.spectator
        );

        socket.join(joined.room.id);
        ctx.socketRooms.set(socket.id, joined.room.id);

        cb && cb({
          ok: true,
          spectator: joined.spectator,
          room: publicRoom(joined.room, u.userId)
        });

        safeRoomState(joined.room);
      } catch (err) {
        cb && cb({ ok: false, error: err.message });
      }
    });

    socket.on("room:leave", (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        if (!room) {
          cb && cb({ ok: true });
          return;
        }

        const u = user(socket);
        const player = bySocket(room, socket.id);

        if (player && Number(player.seat) === 1) {
          terminateRoom(room.id);
          cb && cb({ ok: true, terminated: true });
          return;
        }

        if (player) {
          room.players = room.players.filter(p => p.socketId !== socket.id);
        }

        room.spectators = (room.spectators || []).filter(s => s.socketId !== socket.id);

        socket.leave(room.id);
        ctx.socketRooms.delete(socket.id);

        cb && cb({ ok: true });
        safeRoomState(room);
      } catch (err) {
        cb && cb({ ok: false, error: err.message });
      }
    });

    socket.on("room:terminate", (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        if (!room) {
          cb && cb({ ok: true });
          return;
        }

        const u = user(socket);
        const player = bySocket(room, socket.id);
        const isHost =
          Number(room.hostUserId) === Number(u?.userId) ||
          Number(player?.seat) === 1;

        if (!isHost) throw Error("Host only");

        terminateRoom(room.id);
        cb && cb({ ok: true });
      } catch (err) {
        cb && cb({ ok: false, error: err.message });
      }
    });

    socket.on("room:settings", (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        if (!room) throw Error("Room not found");

        ctx.engine.updateSettings(
          room,
          payload.settings,
          user(socket)?.userId || payload.userId
        );

        cb && cb({ ok: true });
        safeRoomState(room);
      } catch (err) {
        cb && cb({ ok: false, error: err.message });
      }
    });

    socket.on("game:start", (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        if (!room) throw Error("Room not found");

        ctx.engine.start(room, user(socket)?.userId || payload.userId);

        cb && cb({ ok: true });
        safeRoomState(room);
      } catch (err) {
        cb && cb({ ok: false, error: err.message });
      }
    });

    socket.on("game:next", async (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        if (!room) throw Error("Room not found");

        if (Number(room.hostUserId) !== Number(user(socket)?.userId)) {
          throw Error("Host only");
        }

        await ctx.engine.nextPhase(room);

        cb && cb({ ok: true });
        safeRoomState(room);
      } catch (err) {
        cb && cb({ ok: false, error: err.message });
      }
    });

    socket.on("game:action", (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        const player = bySocket(room, socket.id);

        const result = ctx.engine.action(room, player, payload.targetId);
        cb && cb(result);

        safeRoomState(room);
      } catch (err) {
        cb && cb({ ok: false, error: err.message });
      }
    });

    socket.on("game:vote", (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        const player = bySocket(room, socket.id);

        const result = ctx.engine.vote(room, player, payload.targetId);
        cb && cb(result);

        safeRoomState(room);
      } catch (err) {
        cb && cb({ ok: false, error: err.message });
      }
    });

    socket.on("chat:send", (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        if (!room) throw Error("Room not found");

        const player = bySocket(room, socket.id);
        const spectator = (room.spectators || []).find(s => s.socketId === socket.id);
        const sender = player || spectator || user(socket);

        if (!sender) throw Error("Not authorized");

        const msg = ctx.engine.chat(
          room,
          sender,
          payload.message,
          payload.channel || "room"
        );

        if (payload.channel === "mafia") {
          room.players
            .filter(p => p.team === "mafia")
            .forEach(p => p.socketId && io.to(p.socketId).emit("chat:message", msg));
        } else {
          io.to(room.id).emit("chat:message", msg);
        }

        cb && cb({ ok: true, msg });
      } catch (err) {
        cb && cb({ ok: false, error: err.message });
      }
    });

    socket.on("media:state", payload => {
      const room = roomOf(payload.roomId);
      if (!room) return;

      const player = bySocket(room, socket.id);
      if (!player) return;

      ["micOn", "cameraOn", "speaking"].forEach(key => {
        if (typeof payload[key] === "boolean") {
          player[key] = payload[key];
        }
      });

      safeRoomState(room);
    });

    socket.on("signal:offer", ({ to, signal } = {}) => {
      if (to && signal) {
        io.to(to).emit("signal:offer", {
          from: socket.id,
          signal
        });
      }
    });

    socket.on("signal:answer", ({ to, signal } = {}) => {
      if (to && signal) {
        io.to(to).emit("signal:answer", {
          from: socket.id,
          signal
        });
      }
    });

    socket.on("signal:ice", ({ to, candidate } = {}) => {
      if (to && candidate) {
        io.to(to).emit("signal:ice", {
          from: socket.id,
          candidate
        });
      }
    });

    socket.on("disconnect", () => {
      const u = user(socket);
      if (u) ctx.onlineUsers.delete(String(u.userId));

      const roomId = ctx.socketRooms.get(socket.id);
      ctx.socketRooms.delete(socket.id);

      const room = roomId && roomOf(roomId);
      if (!room) return;

      const player = bySocket(room, socket.id);

      if (player && Number(player.seat) === 1) {
        terminateRoom(room.id);
        return;
      }

      if (player) {
        player.connected = false;
        player.speaking = false;
        player.socketId = "";
      }

      room.spectators = (room.spectators || []).filter(s => s.socketId !== socket.id);

      safeRoomState(room);
    });
  });

  setInterval(() => {
    for (const room of ctx.rooms.values()) {
      if (!["waiting", "ended"].includes(room.phase)) {
        room.timer = Math.max(0, Number(room.timer || 0) - 1);

        if (room.timer <= 0) {
          ctx.engine.nextPhase(room);
        } else {
          ctx.engine.roomState(room);
        }
      }
    }
  }, 1000);
}

module.exports = { attachSocketServer };
