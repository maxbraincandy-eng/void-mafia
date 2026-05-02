const {
  getOrCreateGuest,
  findUserById
} = require("../services/userService");

const {
  publicRoom
} = require("../services/gameEngine");

function attachSocketServer(io, ctx) {
  const getSocketUser = socket => socket.data.user;

  const roomOf = id => {
    if (!id) return null;
    return ctx.rooms.get(String(id));
  };

  const playerBySocket = (room, socketId) => {
    if (!room || !Array.isArray(room.players)) return null;
    return room.players.find(p => p.socketId === socketId);
  };

  const spectatorBySocket = (room, socketId) => {
    if (!room || !Array.isArray(room.spectators)) return null;
    return room.spectators.find(s => s.socketId === socketId);
  };

  const getSender = (room, socket) => {
    return (
      playerBySocket(room, socket.id) ||
      spectatorBySocket(room, socket.id) ||
      getSocketUser(socket)
    );
  };

  function safeCallback(cb, data) {
    if (typeof cb === "function") cb(data);
  }

  function joinSocketRoom(socket, room) {
    if (!room) return;

    socket.join(room.id);
    ctx.socketRooms.set(socket.id, room.id);
  }

  function publishRoom(room) {
    if (!room) return;

    ctx.engine.roomState(room);

    if (typeof ctx.engine.publishRooms === "function") {
      ctx.engine.publishRooms();
    }
  }

  io.on("connection", socket => {
    /*
      AUTH
    */
    socket.on("auth", async (payload = {}, cb) => {
      try {
        const existingUserId = payload.userId || payload.user?.userId;

        const user = existingUserId
          ? await findUserById(ctx, existingUserId)
          : await getOrCreateGuest(ctx, payload);

        if (!user) {
          throw new Error("User not found");
        }

        if (user.isBanned) {
          throw new Error("Access denied");
        }

        socket.data.user = user;

        ctx.onlineUsers.set(String(user.userId), {
          socketId: socket.id,
          user
        });

        safeCallback(cb, {
          ok: true,
          user
        });
      } catch (err) {
        safeCallback(cb, {
          ok: false,
          error: err.message
        });
      }
    });

    /*
      ROOM CREATE
    */
    socket.on("room:create", (payload = {}, cb) => {
      try {
        const user = getSocketUser(socket) || payload.user;

        if (!user) {
          throw new Error("Login required");
        }

        const room = ctx.engine.createRoom({
          name: payload.name,
          host: user,
          settings: payload.settings || {}
        });

        if (room.players && room.players[0]) {
          room.players[0].socketId = socket.id;
          room.players[0].connected = true;
          room.players[0].micOn = true;
          room.players[0].cameraOn = true;
          room.players[0].speaking = false;
        }

        joinSocketRoom(socket, room);

        safeCallback(cb, {
          ok: true,
          room: publicRoom(room, user.userId)
        });

        publishRoom(room);
      } catch (err) {
        safeCallback(cb, {
          ok: false,
          error: err.message
        });
      }
    });

    /*
      ROOM JOIN
    */
    socket.on("room:join", (payload = {}, cb) => {
      try {
        const user = getSocketUser(socket) || payload.user;

        if (!user) {
          throw new Error("Login required");
        }

        const result = ctx.engine.joinRoom(
          payload.roomId,
          user,
          socket.id,
          !!payload.spectator
        );

        const room = result.room;

        joinSocketRoom(socket, room);

        const player = playerBySocket(room, socket.id);
        if (player) {
          player.connected = true;
          player.micOn = player.micOn !== false;
          player.cameraOn = player.cameraOn !== false;
          player.speaking = false;
        }

        safeCallback(cb, {
          ok: true,
          spectator: !!result.spectator,
          room: publicRoom(room, user.userId)
        });

        publishRoom(room);
      } catch (err) {
        safeCallback(cb, {
          ok: false,
          error: err.message
        });
      }
    });

    /*
      ROOM SETTINGS
    */
    socket.on("room:settings", (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        if (!room) throw new Error("Room not found");

        const userId = getSocketUser(socket)?.userId || payload.userId;

        ctx.engine.updateSettings(room, payload.settings || {}, userId);

        safeCallback(cb, {
          ok: true,
          room: publicRoom(room, userId)
        });

        publishRoom(room);
      } catch (err) {
        safeCallback(cb, {
          ok: false,
          error: err.message
        });
      }
    });

    /*
      GAME START
    */
    socket.on("game:start", (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        if (!room) throw new Error("Room not found");

        const userId = getSocketUser(socket)?.userId || payload.userId;

        ctx.engine.start(room, userId);

        safeCallback(cb, {
          ok: true,
          room: publicRoom(room, userId)
        });

        publishRoom(room);
      } catch (err) {
        safeCallback(cb, {
          ok: false,
          error: err.message
        });
      }
    });

    /*
      GAME NEXT PHASE
    */
    socket.on("game:next", async (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        if (!room) throw new Error("Room not found");

        const userId = getSocketUser(socket)?.userId || payload.userId;

        if (Number(room.hostUserId) !== Number(userId)) {
          throw new Error("Host only");
        }

        await ctx.engine.nextPhase(room);

        safeCallback(cb, {
          ok: true,
          room: publicRoom(room, userId)
        });

        publishRoom(room);
      } catch (err) {
        safeCallback(cb, {
          ok: false,
          error: err.message
        });
      }
    });

    /*
      GAME ACTION
    */
    socket.on("game:action", (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        if (!room) throw new Error("Room not found");

        const actor = playerBySocket(room, socket.id);
        if (!actor) throw new Error("Player not found");

        const result = ctx.engine.action(room, actor, payload.targetId);

        safeCallback(cb, result);

        publishRoom(room);
      } catch (err) {
        safeCallback(cb, {
          ok: false,
          error: err.message
        });
      }
    });

    /*
      GAME VOTE
    */
    socket.on("game:vote", (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        if (!room) throw new Error("Room not found");

        const actor = playerBySocket(room, socket.id);
        if (!actor) throw new Error("Player not found");

        const result = ctx.engine.vote(room, actor, payload.targetId);

        safeCallback(cb, result);

        publishRoom(room);
      } catch (err) {
        safeCallback(cb, {
          ok: false,
          error: err.message
        });
      }
    });

    /*
      CHAT
    */
    socket.on("chat:send", (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        if (!room) throw new Error("Room not found");

        const sender = getSender(room, socket);
        if (!sender) throw new Error("Sender not found");

        const channel = payload.channel || "room";

        const msg = ctx.engine.chat(
          room,
          sender,
          payload.message,
          channel
        );

        if (channel === "mafia") {
          room.players
            .filter(p => p.team === "mafia")
            .forEach(p => {
              if (p.socketId) {
                io.to(p.socketId).emit("chat:message", msg);
              }
            });
        } else {
          io.to(room.id).emit("chat:message", msg);
        }

        safeCallback(cb, {
          ok: true,
          msg
        });

        publishRoom(room);
      } catch (err) {
        safeCallback(cb, {
          ok: false,
          error: err.message
        });
      }
    });

    /*
      MEDIA STATE
      ეს აჩვენებს MIC/CAM/SPEAKING სტატუსს.
      ხმა თვითონ WebRTC-ით მიდის, ქვემოთ signaling events-ით.
    */
    socket.on("media:state", (payload = {}) => {
      const room = roomOf(payload.roomId);
      if (!room) return;

      const player = playerBySocket(room, socket.id);
      if (!player) return;

      ["micOn", "cameraOn", "speaking"].forEach(key => {
        if (typeof payload[key] === "boolean") {
          player[key] = payload[key];
        }
      });

      publishRoom(room);
    });

    /*
      WEBRTC SIGNALING - ახალი სახელები
      ეს აუცილებელია რომ ხმა/ვიდეო peer-to-peer წავიდეს.
    */
    socket.on("webrtc:offer", (payload = {}) => {
      if (!payload.to || !payload.offer) return;

      io.to(payload.to).emit("webrtc:offer", {
        from: socket.id,
        offer: payload.offer
      });
    });

    socket.on("webrtc:answer", (payload = {}) => {
      if (!payload.to || !payload.answer) return;

      io.to(payload.to).emit("webrtc:answer", {
        from: socket.id,
        answer: payload.answer
      });
    });

    socket.on("webrtc:ice", (payload = {}) => {
      if (!payload.to || !payload.candidate) return;

      io.to(payload.to).emit("webrtc:ice", {
        from: socket.id,
        candidate: payload.candidate
      });
    });

    /*
      LEGACY SIGNALING - ძველი სახელებიც დავტოვოთ,
      რომ ძველი client.js/game.js არ გატყდეს.
    */
    socket.on("signal:offer", ({ to, signal } = {}) => {
      if (!to || !signal) return;

      io.to(to).emit("signal:offer", {
        from: socket.id,
        signal
      });
    });

    socket.on("signal:answer", ({ to, signal } = {}) => {
      if (!to || !signal) return;

      io.to(to).emit("signal:answer", {
        from: socket.id,
        signal
      });
    });

    socket.on("signal:ice", ({ to, candidate } = {}) => {
      if (!to || !candidate) return;

      io.to(to).emit("signal:ice", {
        from: socket.id,
        candidate
      });
    });

    /*
      DISCONNECT
    */
    socket.on("disconnect", () => {
      const user = getSocketUser(socket);

      if (user) {
        ctx.onlineUsers.delete(String(user.userId));
      }

      const roomId = ctx.socketRooms.get(socket.id);
      ctx.socketRooms.delete(socket.id);

      const room = roomId ? roomOf(roomId) : null;
      if (!room) return;

      const player = playerBySocket(room, socket.id);

      if (player) {
        player.connected = false;
        player.speaking = false;
        player.micOn = false;
        player.cameraOn = false;
      }

      if (Array.isArray(room.spectators)) {
        room.spectators = room.spectators.filter(
          spectator => spectator.socketId !== socket.id
        );
      }

      publishRoom(room);
    });
  });

  /*
    PHASE TIMER
  */
  setInterval(async () => {
    for (const room of ctx.rooms.values()) {
      if (!room) continue;
      if (["waiting", "ended"].includes(room.phase)) continue;

      room.timer = Math.max(0, Number(room.timer || 0) - 1);

      if (room.timer <= 0) {
        await ctx.engine.nextPhase(room);
      }

      publishRoom(room);
    }
  }, 1000);
}

module.exports = { attachSocketServer };
