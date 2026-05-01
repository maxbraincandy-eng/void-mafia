const { GameEngine } = require("../engine/GameEngine");
const { createPlayer } = require("../engine/Room");
const { serializeRoom, publicRoom } = require("../engine/Serializer");
const { normalizeRoomSettings } = require("../engine/settings");
const { getOrCreateUser } = require("../services/UserService");
const { safeText } = require("../utils/text");

function attachSocketServer(io, ctx) {
  const engine = new GameEngine(ctx);

  const roomOf = id => ctx.store.getRoom(String(id));
  const playerBySocket = (room, socketId) => room.players.find(p => p.socketId === socketId);

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
        const user = await getOrCreateUser(ctx, payload);
        cb && cb({ ok: true, user });
      } catch (err) {
        cb && cb({ ok: false, error: err.message });
      }
    });

    socket.on("rooms:get", (cb) => {
      const rooms = ctx.store.roomsList().map(publicRoom);
      cb && cb(rooms);
      engine.publishRooms();
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
        cb && cb({ ok: true, room: publicRoom(room), user });
        engine.publishRooms();
      } catch (err) {
        cb && cb({ ok: false, error: err.message });
      }
    });

    socket.on("room:join", async (payload = {}, cb) => {
      const room = roomOf(payload.roomId);
      if (!room) return cb && cb({ ok: false, error: "მაგიდა ვერ მოიძებნა." });

      const user = await getOrCreateUser(ctx, payload.user || {});
      const spectator = !!payload.spectator || room.phase !== "waiting";

      if (spectator) {
        socket.join(room.id);
        if (!room.spectators.some(s => s.userId === user.userId)) {
          room.spectators.push({ ...user, socketId: socket.id });
        }
        cb && cb({ ok: true, spectator: true, user, room: serializeRoom(room, socket.id) });
        engine.roomState(room);
        return;
      }

      if (room.settings.locked) return cb && cb({ ok: false, error: "მაგიდა დახურულია." });
      if (room.players.length >= room.settings.maxPlayers) return cb && cb({ ok: false, error: "მაგიდა სავსეა." });

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
      cb && cb({ ok: true, spectator: false, user, room: serializeRoom(room, socket.id) });
      engine.roomState(room);

      if (room.settings.autoStartWhenFull && room.players.length >= room.settings.maxPlayers) {
        engine.start(room);
      }
    });

    socket.on("room:settings", (payload = {}, cb) => {
      const room = roomOf(payload.roomId);
      if (!room) return cb && cb({ ok: false, error: "მაგიდა ვერ მოიძებნა." });
      if (!isHostOrAdmin(room, socket, payload.userId)) return cb && cb({ ok: false, error: "უფლება არ გაქვს." });

      if (payload.name) room.name = safeText(payload.name, 42);
      cb && cb(engine.updateSettings(room, payload.settings || {}));
    });

    socket.on("game:start", (payload = {}, cb) => {
      const room = roomOf(payload.roomId);
      if (!room) return cb && cb({ ok: false, error: "მაგიდა ვერ მოიძებნა." });
      if (!isHostOrAdmin(room, socket, payload.userId)) return cb && cb({ ok: false, error: "მხოლოდ ჰოსტს შეუძლია." });
      cb && cb(engine.start(room));
    });

    socket.on("game:nominate", (payload = {}, cb) => {
      const room = roomOf(payload.roomId);
      const actor = room && playerBySocket(room, socket.id);
      cb && cb(room ? engine.nominate(room, actor, payload.targetId) : { ok: false });
    });

    socket.on("game:vote", (payload = {}, cb) => {
      const room = roomOf(payload.roomId);
      const actor = room && playerBySocket(room, socket.id);
      cb && cb(room ? engine.vote(room, actor, payload.targetId) : { ok: false });
    });

    socket.on("game:nightAction", (payload = {}, cb) => {
      const room = roomOf(payload.roomId);
      const actor = room && playerBySocket(room, socket.id);
      cb && cb(room ? engine.nightAction(room, actor, payload.targetId) : { ok: false });
    });

    socket.on("chat:send", (payload = {}, cb) => {
      const room = roomOf(payload.roomId);
      if (!room) return cb && cb({ ok: false });

      const player = playerBySocket(room, socket.id);
      const spectator = room.spectators.find(s => s.socketId === socket.id);
      const sender = player || spectator;
      if (!sender) return cb && cb({ ok: false });

      const message = safeText(payload.message, 240);
      if (!message) return cb && cb({ ok: false });

      const msg = {
        at: Date.now(),
        userId: sender.userId,
        seat: player ? player.seat : null,
        nickname: sender.nickname,
        avatar: sender.avatar,
        message
      };

      room.chat.push(msg);
      if (room.chat.length > 120) room.chat.shift();
      room.stats.chatMessages += 1;
      ctx.metrics.inc("chatMessages");
      io.to(room.id).emit("chat:message", msg);
      cb && cb({ ok: true });
    });

    socket.on("media:state", (payload = {}) => {
      const room = roomOf(payload.roomId);
      if (!room) return;
      const p = playerBySocket(room, socket.id);
      if (!p) return;
      if (typeof payload.micOn === "boolean") p.micOn = payload.micOn;
      if (typeof payload.cameraOn === "boolean") p.cameraOn = payload.cameraOn;
      engine.roomState(room);
    });

    socket.on("signal:offer", ({ to, signal }) => io.to(to).emit("signal:offer", { from: socket.id, signal }));
    socket.on("signal:answer", ({ to, signal }) => io.to(to).emit("signal:answer", { from: socket.id, signal }));
    socket.on("signal:ice", ({ to, candidate }) => io.to(to).emit("signal:ice", { from: socket.id, candidate }));

    socket.on("disconnect", () => {
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
        if (before !== room.spectators.length) engine.roomState(room);
      }
    });
  });

  setInterval(() => engine.publishRooms(), 3000);
}

module.exports = { attachSocketServer };
