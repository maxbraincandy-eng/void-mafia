require("dotenv").config();

const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { Server } = require("socket.io");
const mongoose = require("mongoose");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const ADMIN_IDS = String(process.env.ADMIN_IDS || "")
  .split(",").map(x => x.trim()).filter(Boolean);

const PHASES = {
  WAITING: "waiting",
  ROLE_REVEAL: "role_reveal",
  DAY_COMMON: "day_common",
  DAY_INDIVIDUAL: "day_individual",
  NOMINATION: "nomination",
  VOTE: "vote",
  VOTE_RESULT: "vote_result",
  LAST_WORDS: "last_words",
  NIGHT: "night",
  NIGHT_RESULT: "night_result",
  GAME_OVER: "game_over"
};

const ROLE = {
  CITIZEN: "citizen",
  MAFIA: "mafia",
  DON: "don",
  SHERIFF: "sheriff",
  DOCTOR: "doctor",
  DETECTIVE: "detective",
  SERIAL: "serial_killer",
  YAKUZA: "yakuza",
  CHOGUN: "chogun",
  VIGILANTE: "vigilante",
  MANIAC: "maniac"
};

const rooms = new Map();

let User = null;
let Counter = null;

if (process.env.MONGODB_URI) {
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log("MongoDB connected"))
    .catch(err => console.error("MongoDB error:", err.message));

  const counterSchema = new mongoose.Schema({
    key: { type: String, unique: true },
    seq: { type: Number, default: Number(process.env.USER_ID_START || 1) - 1 }
  });

  const userSchema = new mongoose.Schema({
    userId: { type: Number, unique: true, index: true },
    nickname: { type: String, default: "" },
    email: { type: String, unique: true, sparse: true, index: true },
    avatar: { type: String, default: "◆" },
    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    games: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    mvp: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    lastSeen: { type: Date, default: Date.now }
  });

  Counter = mongoose.models.Counter || mongoose.model("Counter", counterSchema);
  User = mongoose.models.User || mongoose.model("User", userSchema);
} else {
  console.log("MongoDB disabled: MONGODB_URI is not set.");
}

async function nextUserId() {
  if (!Counter) return Math.floor(100000 + Math.random() * 900000);
  const c = await Counter.findOneAndUpdate(
    { key: "userId" },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return c.seq;
}

async function getOrCreateUser({ userId, nickname, avatar }) {
  if (!User) {
    return {
      userId: Number(userId || Math.floor(100000 + Math.random() * 900000)),
      nickname: nickname || "Player",
      avatar: avatar || "◆",
      level: 1,
      xp: 0,
      games: 0,
      wins: 0,
      losses: 0,
      mvp: 0
    };
  }

  if (userId) {
    const found = await User.findOne({ userId: Number(userId) });
    if (found) {
      found.lastSeen = new Date();
      if (nickname) found.nickname = nickname;
      if (avatar) found.avatar = avatar;
      await found.save();
      return found.toObject();
    }
  }

  const created = await User.create({
    userId: await nextUserId(),
    nickname: nickname || "Player",
    avatar: avatar || "◆"
  });
  return created.toObject();
}

function roomPublic(room) {
  const startedAt = room.startedAt ? Date.now() - room.startedAt : 0;
  const activeMinutes = Math.max(0, Math.floor(startedAt / 60000));
  return {
    id: room.id,
    name: room.name,
    code: room.id,
    hostUserId: room.hostUserId,
    hostName: room.hostName,
    hostAvatar: room.hostAvatar,
    phase: room.phase,
    phaseLabel: phaseLabel(room.phase),
    timer: room.timer,
    status: room.phase === PHASES.WAITING ? "open" : "live",
    players: room.players.length,
    maxPlayers: room.settings.maxPlayers,
    spectators: room.spectators.length,
    alive: alive(room).length,
    activeMinutes,
    locked: room.locked,
    createdAt: room.createdAt
  };
}

function publishRooms() {
  io.emit("rooms:list", Array.from(rooms.values()).map(roomPublic));
}

function phaseLabel(p) {
  return ({
    [PHASES.WAITING]: "მოლოდინი",
    [PHASES.ROLE_REVEAL]: "როლების გახსნა",
    [PHASES.DAY_COMMON]: "საერთო დრო",
    [PHASES.DAY_INDIVIDUAL]: "ინდივიდუალური გამოსვლები",
    [PHASES.NOMINATION]: "დასახელება",
    [PHASES.VOTE]: "ხმის მიცემა",
    [PHASES.VOTE_RESULT]: "ხმის შედეგი",
    [PHASES.LAST_WORDS]: "ბოლო სიტყვა",
    [PHASES.NIGHT]: "ღამე",
    [PHASES.NIGHT_RESULT]: "ღამის შედეგი",
    [PHASES.GAME_OVER]: "დასასრული"
  })[p] || p;
}

function makeRoom({ name, maxPlayers, roleSettings, timers, owner }) {
  const id = String(Math.floor(100 + Math.random() * 900));
  const room = {
    id,
    name: name || `VOID-${id}`,
    createdAt: Date.now(),
    startedAt: null,
    phase: PHASES.WAITING,
    timer: 0,
    dayNumber: 0,
    round: 0,
    hostSocketId: owner.socketId,
    hostUserId: owner.userId,
    hostName: owner.nickname,
    hostAvatar: owner.avatar,
    locked: false,
    players: [],
    spectators: [],
    settings: {
      maxPlayers: clampInt(maxPlayers, 4, 16, 10),
      roleSettings: normalizeRoleSettings(roleSettings),
      timers: normalizeTimers(timers),
      allowSpectators: true,
      lastWords: true
    },
    individualOrder: [],
    individualIndex: 0,
    individualSpeakerId: null,
    nominations: {},
    nominatedIds: [],
    votes: {},
    nightActions: {},
    phaseInterval: null,
    events: [],
    lastEliminatedId: null,
    gameOver: null
  };
  rooms.set(id, room);
  return room;
}

function normalizeRoleSettings(r = {}) {
  return {
    mafia: clampInt(r.mafia, 1, 6, 1),
    don: !!r.don,
    sheriff: r.sheriff !== false,
    doctor: r.doctor !== false,
    detective: !!r.detective,
    serial: !!r.serial,
    yakuza: !!r.yakuza,
    chogun: !!r.chogun,
    vigilante: !!r.vigilante,
    maniac: !!r.maniac
  };
}

function normalizeTimers(t = {}) {
  return {
    roleReveal: clampInt(t.roleReveal, 5, 30, 8),
    dayCommon: clampInt(t.dayCommon, 20, 600, 60),
    individual: clampInt(t.individual, 20, 180, 60),
    nomination: clampInt(t.nomination, 15, 120, 45),
    vote: clampInt(t.vote, 15, 120, 35),
    lastWords: clampInt(t.lastWords, 10, 120, 45),
    night: clampInt(t.night, 20, 180, 45),
    result: clampInt(t.result, 4, 30, 7)
  };
}

function clampInt(v, min, max, def) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function addEvent(room, text, kind = "info") {
  const ev = { at: Date.now(), text, kind };
  room.events.push(ev);
  if (room.events.length > 80) room.events.shift();
  io.to(room.id).emit("game:event", ev);
}

function emitRoomState(room) {
  io.to(room.id).emit("room:state", serializeRoom(room));
  publishRooms();
}

function serializeRoom(room, forSocketId = null) {
  return {
    id: room.id,
    name: room.name,
    hostUserId: room.hostUserId,
    hostSocketId: room.hostSocketId,
    phase: room.phase,
    phaseLabel: phaseLabel(room.phase),
    timer: room.timer,
    dayNumber: room.dayNumber,
    locked: room.locked,
    settings: room.settings,
    players: room.players.map(p => ({
      id: p.id,
      socketId: p.socketId,
      userId: p.userId,
      seat: p.seat,
      nickname: p.nickname,
      avatar: p.avatar,
      alive: p.alive,
      connected: p.connected,
      role: room.phase === PHASES.GAME_OVER || p.socketId === forSocketId ? p.role : undefined
    })),
    spectators: room.spectators.map(s => ({
      socketId: s.socketId,
      userId: s.userId,
      nickname: s.nickname,
      avatar: s.avatar
    })),
    individualSpeakerId: room.individualSpeakerId,
    individualIndex: room.individualIndex,
    individualTotal: room.individualOrder.length,
    nominations: room.nominations,
    nominatedIds: room.nominatedIds,
    votes: room.votes,
    events: room.events.slice(-20),
    gameOver: room.gameOver
  };
}

function playerBySocket(room, socketId) {
  return room.players.find(p => p.socketId === socketId);
}

function playerById(room, id) {
  return room.players.find(p => p.id === id);
}

function alive(room) {
  return room.players.filter(p => p.alive);
}

function isHost(room, socket) {
  const p = playerBySocket(room, socket.id);
  return p && p.seat === 1;
}

function isPrivileged(userId) {
  return ADMIN_IDS.includes(String(userId));
}

function isHostOrAdmin(room, socket) {
  const p = playerBySocket(room, socket.id);
  return isHost(room, socket) || (p && isPrivileged(p.userId));
}

function clearPhaseTimer(room) {
  if (room.phaseInterval) clearInterval(room.phaseInterval);
  room.phaseInterval = null;
}

function setPhase(room, phase, seconds, onEnd) {
  clearPhaseTimer(room);
  room.phase = phase;
  room.timer = seconds;
  emitRoomState(room);
  io.to(room.id).emit("phase:changed", {
    phase,
    label: phaseLabel(phase),
    timer: seconds,
    dayNumber: room.dayNumber,
    speakerId: room.individualSpeakerId
  });
  publishRooms();

  room.phaseInterval = setInterval(() => {
    room.timer -= 1;
    io.to(room.id).emit("phase:tick", { phase: room.phase, timer: room.timer });
    publishRooms();

    if (room.timer <= 0) {
      clearPhaseTimer(room);
      onEnd && onEnd();
    }
  }, 1000);
}

function startGame(room) {
  if (room.players.length < 4) {
    addEvent(room, "თამაშის დასაწყებად მინიმუმ 4 მოთამაშეა საჭირო.", "warn");
    emitRoomState(room);
    return;
  }

  room.startedAt = Date.now();
  room.dayNumber = 0;
  room.round = 0;
  room.events = [];
  room.gameOver = null;
  room.players.forEach(p => {
    p.alive = true;
    p.role = ROLE.CITIZEN;
  });

  assignRoles(room);
  addEvent(room, "თამაში დაიწყო. როლები დარიგდა.", "system");
  setPhase(room, PHASES.ROLE_REVEAL, room.settings.timers.roleReveal, () => beginNight(room, true));
}

function assignRoles(room) {
  const list = [...room.players].sort(() => Math.random() - 0.5);
  const rs = room.settings.roleSettings;
  let i = 0;
  const give = role => {
    if (i < list.length) list[i++].role = role;
  };

  if (rs.don) give(ROLE.DON);
  for (let m = 0; m < rs.mafia; m++) give(ROLE.MAFIA);
  if (rs.sheriff) give(ROLE.SHERIFF);
  if (rs.doctor) give(ROLE.DOCTOR);
  if (rs.detective) give(ROLE.DETECTIVE);
  if (rs.serial) give(ROLE.SERIAL);
  if (rs.yakuza) give(ROLE.YAKUZA);
  if (rs.chogun) give(ROLE.CHOGUN);
  if (rs.vigilante) give(ROLE.VIGILANTE);
  if (rs.maniac) give(ROLE.MANIAC);
  room.players.forEach(p => {
    if (!p.role) p.role = ROLE.CITIZEN;
  });
}

function beginNight(room, firstNight = false) {
  room.round += 1;
  room.nightActions = {};
  room.lastEliminatedId = null;
  addEvent(room, "ღამე დაიწყო. როლებმა იმოქმედონ.", "phase");
  setPhase(room, PHASES.NIGHT, room.settings.timers.night, () => resolveNight(room));
}

function resolveNight(room) {
  const actions = Object.values(room.nightActions);
  const blocked = new Set(actions.filter(a => a.action === "block").map(a => a.targetId));

  const saves = new Set(actions
    .filter(a => a.action === "save" && !blocked.has(a.actorId))
    .map(a => a.targetId));

  const kills = [];

  const teamKill = (roles, actionName) => {
    const targets = actions
      .filter(a => a.action === actionName && !blocked.has(a.actorId))
      .map(a => a.targetId);
    if (!targets.length) return null;
    return majority(targets);
  };

  const mafiaTarget = teamKill([ROLE.MAFIA, ROLE.DON], "mafia_kill");
  if (mafiaTarget) kills.push({ targetId: mafiaTarget, by: "mafia" });

  const yakuzaTarget = teamKill([ROLE.YAKUZA, ROLE.CHOGUN], "yakuza_kill");
  if (yakuzaTarget) kills.push({ targetId: yakuzaTarget, by: "yakuza" });

  actions.forEach(a => {
    if (blocked.has(a.actorId)) return;
    if (a.action === "serial_kill" || a.action === "vigilante_kill") {
      kills.push({ targetId: a.targetId, by: a.action });
    }
  });

  const deadIds = new Set();
  kills.forEach(k => {
    if (!saves.has(k.targetId)) deadIds.add(k.targetId);
  });

  deadIds.forEach(id => {
    const p = playerById(room, id);
    if (p && p.alive) {
      p.alive = false;
      room.lastEliminatedId = id;
    }
  });

  if (deadIds.size === 0) {
    addEvent(room, "ღამის შემდეგ ყველა ცოცხალია.", "result");
  } else {
    const names = [...deadIds].map(id => {
      const p = playerById(room, id);
      return p ? `#${p.seat} ${p.nickname}` : id;
    }).join(", ");
    addEvent(room, `ღამემ წაიყვანა: ${names}`, "result");
  }

  const win = checkWin(room);
  if (win) return finishGame(room, win);

  setPhase(room, PHASES.NIGHT_RESULT, room.settings.timers.result, () => beginDayCommon(room));
}

function beginDayCommon(room) {
  room.dayNumber += 1;
  room.nominations = {};
  room.nominatedIds = [];
  room.votes = {};
  addEvent(room, `დღე ${room.dayNumber}: საერთო განხილვა დაიწყო.`, "phase");
  setPhase(room, PHASES.DAY_COMMON, room.settings.timers.dayCommon, () => beginIndividual(room));
}

function beginIndividual(room) {
  room.individualOrder = alive(room).map(p => p.id);
  room.individualIndex = 0;
  nextIndividual(room);
}

function nextIndividual(room) {
  if (room.individualIndex >= room.individualOrder.length) {
    room.individualSpeakerId = null;
    return beginNomination(room);
  }

  const speakerId = room.individualOrder[room.individualIndex];
  const speaker = playerById(room, speakerId);
  if (!speaker || !speaker.alive) {
    room.individualIndex += 1;
    return nextIndividual(room);
  }

  room.individualSpeakerId = speakerId;
  addEvent(room, `სიტყვა აქვს #${speaker.seat} ${speaker.nickname}.`, "phase");
  setPhase(room, PHASES.DAY_INDIVIDUAL, room.settings.timers.individual, () => {
    room.individualIndex += 1;
    nextIndividual(room);
  });
}

function beginNomination(room) {
  room.nominations = {};
  room.nominatedIds = [];
  addEvent(room, "დასახელების ფაზა დაიწყო.", "phase");
  setPhase(room, PHASES.NOMINATION, room.settings.timers.nomination, () => resolveNominations(room));
}

function resolveNominations(room) {
  const nominated = Object.values(room.nominations);
  if (!nominated.length) {
    addEvent(room, "კანდიდატი არ დასახელდა. ღამე იწყება.", "result");
    return setPhase(room, PHASES.VOTE_RESULT, room.settings.timers.result, () => beginNight(room));
  }

  const counts = countBy(nominated);
  const max = Math.max(...Object.values(counts));
  room.nominatedIds = Object.keys(counts).filter(id => counts[id] === max);

  const names = room.nominatedIds.map(id => {
    const p = playerById(room, id);
    return p ? `#${p.seat} ${p.nickname}` : id;
  }).join(", ");

  addEvent(room, `ხმის მიცემაზე გადავიდნენ: ${names}`, "result");
  beginVote(room);
}

function beginVote(room) {
  room.votes = {};
  setPhase(room, PHASES.VOTE, room.settings.timers.vote, () => resolveVote(room));
}

function resolveVote(room) {
  const voteValues = Object.values(room.votes);
  if (!voteValues.length) {
    addEvent(room, "ხმები არ დაფიქსირდა. არავინ ტოვებს მაგიდას.", "result");
    return setPhase(room, PHASES.VOTE_RESULT, room.settings.timers.result, () => beginNight(room));
  }

  const realVotes = voteValues.filter(v => v !== "abstain");
  if (!realVotes.length) {
    addEvent(room, "ყველამ თავი შეიკავა. არავინ ტოვებს მაგიდას.", "result");
    return setPhase(room, PHASES.VOTE_RESULT, room.settings.timers.result, () => beginNight(room));
  }

  const counts = countBy(realVotes);
  const max = Math.max(...Object.values(counts));
  const winners = Object.keys(counts).filter(id => counts[id] === max);

  if (winners.length !== 1) {
    addEvent(room, "ხმები გაიყო. არავინ ტოვებს მაგიდას.", "result");
    return setPhase(room, PHASES.VOTE_RESULT, room.settings.timers.result, () => beginNight(room));
  }

  const targetId = winners[0];
  const target = playerById(room, targetId);
  if (!target || !target.alive) {
    addEvent(room, "ხმების სამიზნე აღარ არის აქტიური.", "warn");
    return setPhase(room, PHASES.VOTE_RESULT, room.settings.timers.result, () => beginNight(room));
  }

  target.alive = false;
  room.lastEliminatedId = target.id;
  addEvent(room, `მაგიდა დატოვა #${target.seat} ${target.nickname}.`, "result");

  const win = checkWin(room);
  if (win) return finishGame(room, win);

  setPhase(room, PHASES.VOTE_RESULT, room.settings.timers.result, () => {
    if (room.settings.lastWords) beginLastWords(room, target.id);
    else beginNight(room);
  });
}

function beginLastWords(room, playerId) {
  const p = playerById(room, playerId);
  if (!p) return beginNight(room);
  room.individualSpeakerId = playerId;
  addEvent(room, `ბოლო სიტყვა აქვს #${p.seat} ${p.nickname}.`, "phase");
  setPhase(room, PHASES.LAST_WORDS, room.settings.timers.lastWords, () => {
    room.individualSpeakerId = null;
    beginNight(room);
  });
}

function finishGame(room, win) {
  clearPhaseTimer(room);
  room.phase = PHASES.GAME_OVER;
  room.timer = 0;
  room.gameOver = win;
  addEvent(room, `თამაში დასრულდა: ${win.label}`, "result");
  emitRoomState(room);
}

function checkWin(room) {
  const a = alive(room);
  if (!a.length) return { team: "none", label: "არავინ გადარჩა" };

  const mafia = a.filter(p => [ROLE.MAFIA, ROLE.DON].includes(p.role)).length;
  const yakuza = a.filter(p => [ROLE.YAKUZA, ROLE.CHOGUN].includes(p.role)).length;
  const serial = a.filter(p => p.role === ROLE.SERIAL).length;
  const others = a.length - mafia - yakuza - serial;

  if (serial === 1 && a.length === 1) return { team: "serial", label: "მარტოხელა მკვლელმა მოიგო" };
  if (mafia > 0 && mafia >= (a.length - mafia)) return { team: "mafia", label: "ჩრდილის გუნდმა მოიგო" };
  if (yakuza > 0 && yakuza >= (a.length - yakuza)) return { team: "yakuza", label: "აღმოსავლურმა გუნდმა მოიგო" };
  if (mafia === 0 && yakuza === 0 && serial === 0) return { team: "city", label: "ქალაქმა მოიგო" };
  return null;
}

function countBy(arr) {
  return arr.reduce((m, x) => {
    m[x] = (m[x] || 0) + 1;
    return m;
  }, {});
}

function majority(list) {
  const counts = countBy(list);
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || null;
}

function roleActionFor(role) {
  if ([ROLE.MAFIA, ROLE.DON].includes(role)) return "mafia_kill";
  if ([ROLE.YAKUZA, ROLE.CHOGUN].includes(role)) return "yakuza_kill";
  if (role === ROLE.DOCTOR) return "save";
  if (role === ROLE.SHERIFF) return "sheriff_check";
  if (role === ROLE.DETECTIVE) return "detective_check";
  if (role === ROLE.SERIAL) return "serial_kill";
  if (role === ROLE.VIGILANTE) return "vigilante_kill";
  if (role === ROLE.MANIAC) return "block";
  return null;
}

function checkNightEarlyEnd(room) {
  if (room.phase !== PHASES.NIGHT) return;
  const required = alive(room)
    .filter(p => roleActionFor(p.role))
    .map(p => p.id);
  if (!required.length) return;
  const acted = new Set(Object.values(room.nightActions).map(a => a.actorId));
  if (required.every(id => acted.has(id))) {
    clearPhaseTimer(room);
    resolveNight(room);
  }
}

io.on("connection", (socket) => {
  socket.on("auth:guest", async (payload = {}, cb) => {
    try {
      const user = await getOrCreateUser(payload);
      cb && cb({ ok: true, user });
    } catch (err) {
      cb && cb({ ok: false, error: err.message });
    }
  });

  socket.on("rooms:get", (cb) => cb && cb(Array.from(rooms.values()).map(roomPublic)));

  socket.on("room:create", async (payload = {}, cb) => {
    const user = await getOrCreateUser(payload.user || {});
    const room = makeRoom({
      name: payload.name,
      maxPlayers: payload.maxPlayers,
      roleSettings: payload.roleSettings,
      timers: payload.timers,
      owner: { socketId: socket.id, ...user }
    });
    cb && cb({ ok: true, room: roomPublic(room), user });
    publishRooms();
  });

  socket.on("room:join", async (payload = {}, cb) => {
    const room = rooms.get(String(payload.roomId));
    if (!room) return cb && cb({ ok: false, error: "მაგიდა ვერ მოიძებნა." });

    const user = await getOrCreateUser(payload.user || {});
    const spectator = !!payload.spectator || room.phase !== PHASES.WAITING;

    socket.join(room.id);

    if (spectator) {
      if (!room.spectators.some(s => s.socketId === socket.id)) {
        room.spectators.push({ socketId: socket.id, ...user });
      }
      cb && cb({ ok: true, room: serializeRoom(room, socket.id), user, spectator: true });
      emitRoomState(room);
      return;
    }

    if (room.locked) return cb && cb({ ok: false, error: "მაგიდა დახურულია." });
    if (room.players.length >= room.settings.maxPlayers) return cb && cb({ ok: false, error: "მაგიდა სავსეა." });

    let p = room.players.find(x => x.userId === user.userId);
    if (p) {
      p.socketId = socket.id;
      p.connected = true;
    } else {
      p = {
        id: crypto.randomUUID(),
        socketId: socket.id,
        userId: user.userId,
        nickname: user.nickname,
        avatar: user.avatar,
        seat: room.players.length + 1,
        alive: true,
        role: ROLE.CITIZEN,
        connected: true
      };
      room.players.push(p);
      if (p.seat === 1) {
        room.hostSocketId = socket.id;
        room.hostUserId = p.userId;
        room.hostName = p.nickname;
        room.hostAvatar = p.avatar;
      }
    }

    cb && cb({ ok: true, room: serializeRoom(room, socket.id), user, spectator: false });
    addEvent(room, `#${p.seat} ${p.nickname} შემოვიდა მაგიდაზე.`, "join");
    emitRoomState(room);
  });

  socket.on("room:settings", (payload = {}, cb) => {
    const room = rooms.get(String(payload.roomId));
    if (!room) return cb && cb({ ok: false });
    if (!isHostOrAdmin(room, socket)) return cb && cb({ ok: false, error: "უფლება არ გაქვს." });

    if (payload.name) room.name = String(payload.name).slice(0, 40);
    if (payload.maxPlayers) room.settings.maxPlayers = clampInt(payload.maxPlayers, 4, 16, room.settings.maxPlayers);
    if (payload.roleSettings) room.settings.roleSettings = { ...room.settings.roleSettings, ...normalizeRoleSettings(payload.roleSettings) };
    if (payload.timers) room.settings.timers = { ...room.settings.timers, ...normalizeTimers(payload.timers) };
    if (typeof payload.locked === "boolean") room.locked = payload.locked;
    if (typeof payload.lastWords === "boolean") room.settings.lastWords = payload.lastWords;

    addEvent(room, "მაგიდის პარამეტრები განახლდა.", "system");
    emitRoomState(room);
    cb && cb({ ok: true, room: serializeRoom(room, socket.id) });
  });

  socket.on("game:start", (payload = {}, cb) => {
    const room = rooms.get(String(payload.roomId));
    if (!room) return cb && cb({ ok: false });
    if (!isHostOrAdmin(room, socket)) return cb && cb({ ok: false, error: "მხოლოდ ჰოსტს შეუძლია დაწყება." });
    startGame(room);
    cb && cb({ ok: true });
  });

  socket.on("game:forcePhase", (payload = {}, cb) => {
    const room = rooms.get(String(payload.roomId));
    if (!room || !isHostOrAdmin(room, socket)) return cb && cb({ ok: false });
    const phase = payload.phase;
    clearPhaseTimer(room);
    if (phase === "night") beginNight(room);
    else if (phase === "day") beginDayCommon(room);
    else if (phase === "vote") beginVote(room);
    else emitRoomState(room);
    cb && cb({ ok: true });
  });

  socket.on("game:nominate", (payload = {}, cb) => {
    const room = rooms.get(String(payload.roomId));
    if (!room || room.phase !== PHASES.NOMINATION) return cb && cb({ ok: false });
    const actor = playerBySocket(room, socket.id);
    if (!actor || !actor.alive) return cb && cb({ ok: false });
    const target = playerById(room, payload.targetId);
    if (!target || !target.alive || target.id === actor.id) return cb && cb({ ok: false });

    room.nominations[actor.id] = target.id;
    addEvent(room, `#${actor.seat} დაასახელა #${target.seat}.`, "nomination");
    emitRoomState(room);
    cb && cb({ ok: true });
  });

  socket.on("game:vote", (payload = {}, cb) => {
    const room = rooms.get(String(payload.roomId));
    if (!room || room.phase !== PHASES.VOTE) return cb && cb({ ok: false });
    const actor = playerBySocket(room, socket.id);
    if (!actor || !actor.alive) return cb && cb({ ok: false });

    const vote = payload.targetId === "abstain" ? "abstain" : String(payload.targetId);
    if (vote !== "abstain" && !room.nominatedIds.includes(vote)) return cb && cb({ ok: false, error: "ამ კანდიდატზე ხმა ვერ მიეცემა." });

    room.votes[actor.id] = vote;
    addEvent(room, `#${actor.seat}-მა ხმა დააფიქსირა.`, "vote");
    emitRoomState(room);

    if (Object.keys(room.votes).length >= alive(room).length) {
      clearPhaseTimer(room);
      resolveVote(room);
    }
    cb && cb({ ok: true });
  });

  socket.on("game:nightAction", (payload = {}, cb) => {
    const room = rooms.get(String(payload.roomId));
    if (!room || room.phase !== PHASES.NIGHT) return cb && cb({ ok: false });
    const actor = playerBySocket(room, socket.id);
    if (!actor || !actor.alive) return cb && cb({ ok: false });

    const action = roleActionFor(actor.role);
    if (!action) return cb && cb({ ok: false, error: "შენ როლს ღამის მოქმედება არ აქვს." });

    const target = playerById(room, payload.targetId);
    if (!target || !target.alive) return cb && cb({ ok: false, error: "სამიზნე არასწორია." });

    if ((action.includes("kill") || action === "block" || action.includes("check")) && target.id === actor.id) {
      return cb && cb({ ok: false, error: "ამ მოქმედებას საკუთარ თავზე ვერ გააკეთებ." });
    }

    room.nightActions[actor.id] = { actorId: actor.id, targetId: target.id, action };
    addEvent(room, `#${actor.seat}-მა ღამის მოქმედება აირჩია.`, "night");
    emitRoomState(room);
    checkNightEarlyEnd(room);
    cb && cb({ ok: true });
  });

  socket.on("chat:send", (payload = {}, cb) => {
    const room = rooms.get(String(payload.roomId));
    if (!room) return cb && cb({ ok: false });
    const p = playerBySocket(room, socket.id);
    const s = room.spectators.find(x => x.socketId === socket.id);
    const sender = p || s;
    if (!sender) return cb && cb({ ok: false });

    const msg = String(payload.message || "").trim().slice(0, 240);
    if (!msg) return cb && cb({ ok: false });

    io.to(room.id).emit("chat:message", {
      at: Date.now(),
      userId: sender.userId,
      nickname: sender.nickname,
      seat: p ? p.seat : null,
      avatar: sender.avatar,
      message: msg
    });
    cb && cb({ ok: true });
  });

  socket.on("signal:offer", ({ to, signal }) => io.to(to).emit("signal:offer", { from: socket.id, signal }));
  socket.on("signal:answer", ({ to, signal }) => io.to(to).emit("signal:answer", { from: socket.id, signal }));
  socket.on("signal:ice", ({ to, candidate }) => io.to(to).emit("signal:ice", { from: socket.id, candidate }));

  socket.on("disconnect", () => {
    for (const room of rooms.values()) {
      const p = playerBySocket(room, socket.id);
      if (p) {
        p.connected = false;
        addEvent(room, `#${p.seat} კავშირი გაწყდა.`, "leave");
        emitRoomState(room);
      }
      const before = room.spectators.length;
      room.spectators = room.spectators.filter(s => s.socketId !== socket.id);
      if (room.spectators.length !== before) emitRoomState(room);
    }
  });
});

setInterval(() => publishRooms(), 4000);

server.listen(PORT, () => {
  console.log(`VOID MAFIA v10 Flow Engine running on ${PORT}`);
});
