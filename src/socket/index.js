const { GameEngine } = require("../engine/GameEngine");
const { createPlayer } = require("../engine/Room");
const { serializeRoom, publicRoom } = require("../engine/Serializer");
const { normalizeRoomSettings } = require("../engine/settings");
const { getOrCreateUser } = require("../services/UserService");
const { safeText } = require("../utils/text");

function attachSocketServer(io, ctx) {
  const engine = new GameEngine(ctx);

  const roomOf = id => ctx.store.getRoom(String(id));
  const playerBySocket = (room, socketId) =>
    room && room.players ? room.players.find(p => p.socketId === socketId) : null;

  function reply(cb, data) {
    if (typeof cb === "function") cb(data);
  }

  function isAdmin(userId) {
    return ctx.security.adminIds.includes(String(userId));
  }

  function isHostOrAdmin(room, socket, userId = null) {
    const p = playerBySocket(room, socket.id);
    return (p && p.seat === 1) || isAdmin(userId || p?.userId);
  }

  io.on("connection", socket => {
    ctx.metrics.inc("socketConnections");

    socket.on("auth:guest", async (payload = {}, cb) => {
      try {
        const user = await getOrCreateUser(ctx, payload || {});
        reply(cb, { ok: true, user });
      } catch (err) {
        console.error("auth:guest failed:", err);
        reply(cb, { ok: false, error: err.message || "Auth failed" });
      }
    });

    socket.on("rooms:get", (payload = {}, cb) => {
      try {
        const rooms = ctx.store.roomsList().map(publicRoom);
        reply(cb, rooms);
        engine.publishRooms();
      } catch (err) {
        console.error("rooms:get failed:", err);
        reply(cb, []);
      }
    });

    socket.on("room:create", async (payload = {}, cb) => {
      try {
        const user = await getOrCreateUser(ctx, payload.user || {});
        const room = ctx.store.createRoom({
          owner: { ...user, socketId: socket.id },
          name: safeText(payload.name || payload.settings?.name, 42) || "VOID TABLE",
          settings: normalizeRoomSettings(payload.settings || {})
        });

        ctx.metrics.inc("roomsCreated");

        reply(cb, {
          ok: true,
          room: publicRoom(room),
          user
        });

        engine.publishRooms();
      } catch (err) {
        console.error("room:create failed:", err);
        reply(cb, {
          ok: false,
          error: err.message || "მაგიდის შექმნა ვერ მოხერხდა."
        });
      }
    });

    socket.on("room:join", async (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);

        if (!room) {
          return reply(cb, {
            ok: false,
            error: "მაგიდა ვერ მოიძებნა."
          });
        }

        const user = await getOrCreateUser(ctx, payload.user || {});
        const spectator = !!payload.spectator || room.phase !== "waiting";

        if (spectator) {
          socket.join(room.id);

          if (!room.spectators.some(s => s.userId === user.userId)) {
            room.spectators.push({ ...user, socketId: socket.id });
          }

          reply(cb, {
            ok: true,
            spectator: true,
            user,
            room: serializeRoom(room, socket.id)
          });

          engine.roomState(room);
          return;
        }

        if (room.settings.locked) {
          return reply(cb, {
            ok: false,
            error: "მაგიდა დახურულია."
          });
        }

        if (room.players.length >= room.settings.maxPlayers) {
          return reply(cb, {
            ok: false,
            error: "მაგიდა სავსეა."
          });
        }

        socket.join(room.id);

        let player = room.players.find(p => p.userId === user.userId);

        if (player) {
          player.socketId = socket.id;
          player.connected = true;
          player.lastSeenAt = Date.now();
        } else {
          player = createPlayer({ socketId: socket.id, user });
          player.seat = room.players.length + 1;
          room.players.push(player);
        }

        if (player.seat === 1) {
          room.hostUserId = player.userId;
          room.hostSocketId = socket.id;
          room.hostName = player.nickname;
          room.hostAvatar = player.avatar;
        }

        engine.event(room, `#${player.seat} ${player.nickname} შემოვიდა.`, "join");

        reply(cb, {
          ok: true,
          spectator: false,
          user,
          room: serializeRoom(room, socket.id)
        });

        engine.roomState(room);

        if (room.settings.autoStartWhenFull && room.players.length >= room.settings.maxPlayers) {
          engine.start(room);
        }
      } catch (err) {
        console.error("room:join failed:", err);
        reply(cb, {
          ok: false,
          error: err.message || "მაგიდაში შესვლა ვერ მოხერხდა."
        });
      }
    });

    socket.on("room:settings", (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);

        if (!room) {
          return reply(cb, {
            ok: false,
            error: "მაგიდა ვერ მოიძებნა."
          });
        }

        if (!isHostOrAdmin(room, socket, payload.userId)) {
          return reply(cb, {
            ok: false,
            error: "უფლება არ გაქვს."
          });
        }

        if (payload.name) {
          room.name = safeText(payload.name, 42);
        }

        const result = engine.updateSettings(room, payload.settings || {});
        reply(cb, result);
      } catch (err) {
        console.error("room:settings failed:", err);
        reply(cb, {
          ok: false,
          error: err.message || "პარამეტრების შეცვლა ვერ მოხერხდა."
        });
      }
    });

    socket.on("game:start", (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);

        if (!room) {
          return reply(cb, {
            ok: false,
            error: "მაგიდა ვერ მოიძებნა."
          });
        }

        if (!isHostOrAdmin(room, socket, payload.userId)) {
          return reply(cb, {
            ok: false,
            error: "მხოლოდ ჰოსტს შეუძლია."
          });
        }

        reply(cb, engine.start(room));
      } catch (err) {
        console.error("game:start failed:", err);
        reply(cb, {
          ok: false,
          error: err.message || "თამაშის დაწყება ვერ მოხერხდა."
        });
      }
    });

    socket.on("game:nominate", (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        const actor = room ? playerBySocket(room, socket.id) : null;

        if (!room) {
          return reply(cb, {
            ok: false,
            error: "მაგიდა ვერ მოიძებნა."
          });
        }

        reply(cb, engine.nominate(room, actor, payload.targetId));
      } catch (err) {
        console.error("game:nominate failed:", err);
        reply(cb, {
          ok: false,
          error: err.message || "დასახელება ვერ მოხერხდა."
        });
      }
    });

    socket.on("game:vote", (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        const actor = room ? playerBySocket(room, socket.id) : null;

        if (!room) {
          return reply(cb, {
            ok: false,
            error: "მაგიდა ვერ მოიძებნა."
          });
        }

        reply(cb, engine.vote(room, actor, payload.targetId));
      } catch (err) {
        console.error("game:vote failed:", err);
        reply(cb, {
          ok: false,
          error: err.message || "ხმის მიცემა ვერ მოხერხდა."
        });
      }
    });

    socket.on("game:nightAction", (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        const actor = room ? playerBySocket(room, socket.id) : null;

        if (!room) {
          return reply(cb, {
            ok: false,
            error: "მაგიდა ვერ მოიძებნა."
          });
        }

        reply(cb, engine.nightAction(room, actor, payload.targetId));
      } catch (err) {
        console.error("game:nightAction failed:", err);
        reply(cb, {
          ok: false,
          error: err.message || "ღამის მოქმედება ვერ მოხერხდა."
        });
      }
    });

    socket.on("chat:send", (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);

        if (!room) {
          return reply(cb, {
            ok: false,
            error: "მაგიდა ვერ მოიძებნა."
          });
        }

        const player = playerBySocket(room, socket.id);
        const spectator = room.spectators.find(s => s.socketId === socket.id);
        const sender = player || spectator;

        if (!sender) {
          return reply(cb, {
            ok: false,
            error: "მომხმარებელი ვერ მოიძებნა."
          });
        }

        const message = safeText(payload.message, 240);

        if (!message) {
          return reply(cb, {
            ok: false,
            error: "ცარიელი მესიჯი."
          });
        }

        const msg = {
          at: Date.now(),
          userId: sender.userId,
          seat: player ? player.seat : null,
          nickname: sender.nickname,
          avatar: sender.avatar,
          message
        };

        room.chat.push(msg);

        if (room.chat.length > 120) {
          room.chat.shift();
        }

        room.stats.chatMessages += 1;
        ctx.metrics.inc("chatMessages");

        io.to(room.id).emit("chat:message", msg);

        reply(cb, { ok: true });
      } catch (err) {
        console.error("chat:send failed:", err);
        reply(cb, {
          ok: false,
          error: err.message || "მესიჯის გაგზავნა ვერ მოხერხდა."
        });
      }
    });

    socket.on("media:state", (payload = {}) => {
      try {
        const room = roomOf(payload.roomId);

        if (!room) return;

        const p = playerBySocket(room, socket.id);

        if (!p) return;

        if (typeof payload.micOn === "boolean") {
          p.micOn = payload.micOn;
        }

        if (typeof payload.cameraOn === "boolean") {
          p.cameraOn = payload.cameraOn;
        }

        engine.roomState(room);
      } catch (err) {
        console.error("media:state failed:", err);
      }
    });

    socket.on("signal:offer", (payload = {}) => {
      try {
        if (!payload.to || !payload.signal) return;
        io.to(payload.to).emit("signal:offer", {
          from: socket.id,
          signal: payload.signal
        });
      } catch (err) {
        console.error("signal:offer failed:", err);
      }
    });

    socket.on("signal:answer", (payload = {}) => {
      try {
        if (!payload.to || !payload.signal) return;
        io.to(payload.to).emit("signal:answer", {
          from: socket.id,
          signal: payload.signal
        });
      } catch (err) {
        console.error("signal:answer failed:", err);
      }
    });

    socket.on("signal:ice", (payload = {}) => {
      try {
        if (!payload.to || !payload.candidate) return;
        io.to(payload.to).emit("signal:ice", {
          from: socket.id,
          candidate: payload.candidate
        });
      } catch (err) {
        console.error("signal:ice failed:", err);
      }
    });

    socket.on("disconnect", () => {
      try {
        for (const room of ctx.store.roomsList()) {
          const p = room.players.find(x => x.socketId === socket.id);

          if (p) {
            p.connected = false;
            p.lastSeenAt = Date.now();
            engine.event(room, `#${p.seat} კავშირი გაწყდა.`, "leave");
            engine.roomState(room);
          }

          const before = room.spectators.length;
          room.spectators = room.spectators.filter(s => s.socketId !== socket.id);

          if (before !== room.spectators.length) {
            engine.roomState(room);
          }
        }
      } catch (err) {
        console.error("disconnect handler failed:", err);
      }
    });
  });

  setInterval(() => {
    try {
      engine.publishRooms();
    } catch (err) {
      console.error("publishRooms interval failed:", err);
    }
  }, 3000);
}

module.exports = { attachSocketServer };
