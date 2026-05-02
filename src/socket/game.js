const {
  createRoom, addPlayer, event, publicRoom, serializeRoom,
  normalizeSettings, startGame, tickRoom, nominate, vote, nightAction
} = require("./game");
const { createGuestUser, getProfile, cleanText } = require("./db");

function attachSocket(io, runtime) {
  function roomOf(id) { return runtime.rooms.get(String(id)); }
  function playerBySocket(room, socketId) { return room.players.find(p => p.socketId === socketId); }

  function publishRooms() {
    io.emit("rooms:list", Array.from(runtime.rooms.values()).map(publicRoom));
  }

  function socketsInRoom(room) {
    return [
      ...room.players.map(p => p.socketId).filter(Boolean),
      ...room.spectators.map(s => s.socketId).filter(Boolean)
    ];
  }

  function sendRoomState(room) {
    for (const socketId of socketsInRoom(room)) {
      io.to(socketId).emit("room:state", serializeRoom(room, socketId));
    }
    publishRooms();
  }

  io.on("connection", socket => {
    runtime.metrics.sockets += 1;

    socket.on("auth:guest", async (payload = {}, cb) => {
      try { cb && cb({ ok: true, user: await createGuestUser(runtime.db, payload) }); }
      catch (err) { cb && cb({ ok: false, error: err.message }); }
    });

    socket.on("rooms:get", (payload, cb) => {
      const rooms = Array.from(runtime.rooms.values()).map(publicRoom);
      cb && cb({ ok: true, rooms });
      socket.emit("rooms:list", rooms);
    });

    socket.on("room:create", async (payload = {}, cb) => {
      try {
        let owner = payload.user || {};
        if (runtime.db.enabled && owner.userId) owner = await getProfile(runtime.db, owner.userId) || owner;
        owner.socketId = socket.id;

        const room = createRoom({ owner, name: payload.name || payload.settings?.name, settings: normalizeSettings(payload.settings || {}) });
        runtime.rooms.set(room.id, room);
        socket.join(room.id);
        runtime.metrics.roomsCreated += 1;

        cb && cb({ ok: true, room: serializeRoom(room, socket.id), publicRoom: publicRoom(room) });
        sendRoomState(room);
      } catch (err) {
        console.error("room:create failed:", err);
        cb && cb({ ok: false, error: "ოთახის შექმნა ვერ მოხერხდა" });
      }
    });

    socket.on("room:join", async (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        if (!room) return cb && cb({ ok: false, error: "ოთახი ვერ მოიძებნა" });

        let user = payload.user || {};
        if (runtime.db.enabled && user.userId) user = await getProfile(runtime.db, user.userId) || user;
        user.socketId = socket.id;
        socket.join(room.id);

        const asSpectator = !!payload.spectator || room.phase !== "waiting";
        if (asSpectator) {
          if (!room.spectators.some(s => String(s.userId) === String(user.userId))) {
            room.spectators.push({ userId: user.userId, socketId: socket.id, nickname: user.nickname || "Spectator", avatar: user.avatar || "👁" });
          }
          cb && cb({ ok: true, spectator: true, room: serializeRoom(room, socket.id) });
          sendRoomState(room);
          return;
        }

        if (room.settings.locked) return cb && cb({ ok: false, error: "ოთახი დახურულია" });
        if (room.players.length >= room.settings.maxPlayers) return cb && cb({ ok: false, error: "ოთახი სავსეა" });

        const player = addPlayer(room, user);
        event(room, `#${player.seat} ${player.nickname} შემოვიდა`, "join");

        cb && cb({ ok: true, spectator: false, room: serializeRoom(room, socket.id) });
        sendRoomState(room);

        if (room.settings.autoStartWhenFull && room.players.length >= room.settings.maxPlayers) {
          startGame(room);
          sendRoomState(room);
        }
      } catch (err) {
        console.error("room:join failed:", err);
        cb && cb({ ok: false, error: "ოთახში შესვლა ვერ მოხერხდა" });
      }
    });

    socket.on("room:settings", (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        if (!room) return cb && cb({ ok: false, error: "ოთახი ვერ მოიძებნა" });
        const actor = playerBySocket(room, socket.id);
        if (!actor || String(actor.userId) !== String(room.hostUserId)) return cb && cb({ ok: false, error: "მხოლოდ ჰოსტს შეუძლია" });

        room.settings = normalizeSettings({ ...room.settings, ...(payload.settings || {}) });
        if (payload.name) room.name = cleanText(payload.name, 42);
        event(room, "ოთახის პარამეტრები განახლდა", "settings");

        cb && cb({ ok: true, room: serializeRoom(room, socket.id) });
        sendRoomState(room);
      } catch (err) {
        console.error("room:settings failed:", err);
        cb && cb({ ok: false, error: "პარამეტრები ვერ შეინახა" });
      }
    });

    socket.on("game:start", (payload = {}, cb) => {
      const room = roomOf(payload.roomId);
      if (!room) return cb && cb({ ok: false, error: "ოთახი ვერ მოიძებნა" });
      const actor = playerBySocket(room, socket.id);
      if (!actor || String(actor.userId) !== String(room.hostUserId)) return cb && cb({ ok: false, error: "მხოლოდ ჰოსტს შეუძლია" });
      const res = startGame(room);
      if (res.ok) runtime.metrics.gamesStarted += 1;
      cb && cb(res);
      sendRoomState(room);
    });

    socket.on("chat:send", (payload = {}, cb) => {
      try {
        const room = roomOf(payload.roomId);
        if (!room) return cb && cb({ ok: false, error: "ოთახი ვერ მოიძებნა" });
        const player = playerBySocket(room, socket.id);
        const spectator = room.spectators.find(s => s.socketId === socket.id);
        const sender = player || spectator;
        if (!sender) return cb && cb({ ok: false, error: "ჩატისთვის ჯერ ოთახში უნდა იყო" });

        const message = cleanText(payload.message, 240);
        if (!message) return cb && cb({ ok: false, error: "ცარიელი მესიჯი ვერ გაიგზავნება" });

        const msg = { at: Date.now(), userId: sender.userId, seat: player ? player.seat : null, nickname: sender.nickname || "Player", avatar: sender.avatar || "◆", message };
        room.chat.push(msg);
        if (room.chat.length > 120) room.chat.shift();
        runtime.metrics.chatMessages += 1;
        io.to(room.id).emit("chat:message", msg);
        cb && cb({ ok: true, message: msg });
      } catch (err) {
        console.error("chat failed:", err);
        cb && cb({ ok: false, error: "ჩატის შეცდომა სერვერზე" });
      }
    });

    socket.on("media:state", (payload = {}) => {
      const room = roomOf(payload.roomId);
      if (!room) return;
      const p = playerBySocket(room, socket.id);
      if (!p) return;
      if (typeof payload.micOn === "boolean") p.micOn = payload.micOn;
      if (typeof payload.cameraOn === "boolean") p.cameraOn = payload.cameraOn;
      sendRoomState(room);
    });

    socket.on("game:nominate", (payload = {}, cb) => {
      const room = roomOf(payload.roomId);
      const actor = room && playerBySocket(room, socket.id);
      const res = room ? nominate(room, actor, payload.targetId) : { ok: false, error: "ოთახი ვერ მოიძებნა" };
      cb && cb(res);
      if (room) sendRoomState(room);
    });

    socket.on("game:vote", (payload = {}, cb) => {
      const room = roomOf(payload.roomId);
      const actor = room && playerBySocket(room, socket.id);
      const res = room ? vote(room, actor, payload.targetId) : { ok: false, error: "ოთახი ვერ მოიძებნა" };
      cb && cb(res);
      if (room) sendRoomState(room);
    });

    socket.on("game:nightAction", (payload = {}, cb) => {
      const room = roomOf(payload.roomId);
      const actor = room && playerBySocket(room, socket.id);
      const res = room ? nightAction(room, actor, payload.targetId) : { ok: false, error: "ოთახი ვერ მოიძებნა" };
      cb && cb(res);
      if (room) sendRoomState(room);
    });

    socket.on("signal:offer", ({ to, signal }) => { if (to) io.to(to).emit("signal:offer", { from: socket.id, signal }); });
    socket.on("signal:answer", ({ to, signal }) => { if (to) io.to(to).emit("signal:answer", { from: socket.id, signal }); });
    socket.on("signal:ice", ({ to, candidate }) => { if (to) io.to(to).emit("signal:ice", { from: socket.id, candidate }); });

    socket.on("disconnect", () => {
      for (const room of runtime.rooms.values()) {
        const p = playerBySocket(room, socket.id);
        if (p) {
          p.connected = false;
          p.lastSeenAt = Date.now();
          event(room, `#${p.seat} ${p.nickname} გავიდა`, "leave");
          sendRoomState(room);
        }
        const before = room.spectators.length;
        room.spectators = room.spectators.filter(s => s.socketId !== socket.id);
        if (before !== room.spectators.length) sendRoomState(room);
      }
    });
  });

  setInterval(() => {
    for (const room of runtime.rooms.values()) {
      const before = room.phase + ":" + room.timer;
      tickRoom(room);
      const after = room.phase + ":" + room.timer;
      if (before !== after) sendRoomState(room);
    }
  }, 1000);

  setInterval(publishRooms, 3000);
}

module.exports = { attachSocket };
