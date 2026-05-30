require("dotenv").config();

const path = require("path");
const http = require("http");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const { Server } = require("socket.io");

let mongoose = null;
try {
  mongoose = require("mongoose");
} catch (_) {
  mongoose = null;
}

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || "";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 30000,
  pingInterval: 10000
});

app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "void_mafia_v199_secret_change_me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 30
    }
  })
);

app.use((req, res, next) => {
  if (req.path === "/" || req.path.endsWith(".html") || req.path.endsWith(".js") || req.path.endsWith(".css")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

app.use(express.static(path.join(__dirname, "..", "public"), { etag: false, maxAge: 0 }));

/* -----------------------------
   MongoDB models + memory fallback
------------------------------ */

const memory = {
  nextUserId: Number(process.env.USER_ID_START || 1),
  users: new Map(),
  clans: new Map()
};

let db = { enabled: false, User: null, Clan: null, Counter: null };

const DEFAULT_STATS = {
  games: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  survived: 0,
  mafiaGames: 0,
  citizenGames: 0,
  mvp: 0,
  xp: 0,
  rating: 5,
  coins: 50,
  energy: 20,
  warnings: 0
};

function now() {
  return new Date();
}

function safeText(value, fallback = "") {
  return String(value || fallback).trim();
}

function cleanNickname(value) {
  return safeText(value, "Player").slice(0, 32) || "Player";
}

function cleanEmail(value) {
  return safeText(value).toLowerCase();
}

function cleanAvatar(value) {
  return safeText(value, "◆").slice(0, 4) || "◆";
}

function publicUser(user) {
  if (!user) return null;
  const u = typeof user.toObject === "function" ? user.toObject() : user;

  return {
    userId: Number(u.userId),
    nickname: u.nickname || "Player",
    email: u.email || "",
    avatar: u.avatar || "◆",
    country: u.country || "GE",
    language: u.language || "Georgian",
    clanId: u.clanId || "",
    clanTag: u.clanTag || "",
    rank: rankName(u.stats?.xp || 0),
    level: levelFromXp(u.stats?.xp || 0),
    stats: { ...DEFAULT_STATS, ...(u.stats || {}) },
    inventory: u.inventory || { items: [], frames: [], crystals: 0 },
    settings: u.settings || {
      allowMessages: true,
      roomInvites: true,
      seekingRoom: false,
      music: true,
      sfx: true
    },
    createdAt: u.createdAt || null,
    lastLoginAt: u.lastLoginAt || null
  };
}

function levelFromXp(xp) {
  return Math.max(1, Math.floor(Number(xp || 0) / 100) + 1);
}

function rankName(xp) {
  const n = Number(xp || 0);
  if (n >= 5000) return "Godfather";
  if (n >= 2500) return "Boss";
  if (n >= 1200) return "Underboss";
  if (n >= 500) return "Soldier";
  return "Newbie";
}

async function connectDatabase() {
  if (!mongoose || !MONGODB_URI) {
    console.log("MongoDB disabled: memory fallback enabled");
    return;
  }

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 8000
    });

    const CounterSchema = new mongoose.Schema({
      key: { type: String, unique: true },
      value: { type: Number, default: 0 }
    });

    const UserSchema = new mongoose.Schema(
      {
        userId: { type: Number, unique: true, index: true },
        nickname: String,
        email: { type: String, lowercase: true, index: true },
        passwordHash: String,
        avatar: String,
        country: { type: String, default: "GE" },
        language: { type: String, default: "Georgian" },
        clanId: { type: String, default: "" },
        clanTag: { type: String, default: "" },
        stats: { type: Object, default: () => ({ ...DEFAULT_STATS }) },
        inventory: { type: Object, default: () => ({ items: [], frames: [], crystals: 0 }) },
        settings: { type: Object, default: () => ({ allowMessages: true, roomInvites: true, seekingRoom: false, music: true, sfx: true }) },
        lastLoginAt: Date
      },
      { timestamps: true }
    );

    const ClanSchema = new mongoose.Schema(
      {
        clanId: { type: String, unique: true, index: true },
        name: String,
        tag: String,
        emblem: String,
        ownerUserId: Number,
        level: { type: Number, default: 1 },
        power: { type: Number, default: 0 },
        members: { type: Array, default: [] },
        trophies: { type: Object, default: () => ({ gold: 0, silver: 0, bronze: 0 }) }
      },
      { timestamps: true }
    );

    db.Counter = mongoose.models.Counter || mongoose.model("Counter", CounterSchema);
    db.User = mongoose.models.User || mongoose.model("User", UserSchema);
    db.Clan = mongoose.models.Clan || mongoose.model("Clan", ClanSchema);
    db.enabled = true;
    console.log("MongoDB enabled");
  } catch (err) {
    console.error("MongoDB connect failed, using memory fallback:", err.message);
    db.enabled = false;
  }
}

async function nextUserId() {
  if (!db.enabled) return memory.nextUserId++;

  const start = Number(process.env.USER_ID_START || 1);
  const c = await db.Counter.findOneAndUpdate(
    { key: "userId" },
    { $setOnInsert: { value: start - 1 }, $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  return c.value;
}

async function findUserById(id) {
  const userId = Number(id);
  if (!userId) return null;

  if (db.enabled) {
    const u = await db.User.findOne({ userId }).lean();
    return publicUser(u);
  }

  return publicUser(memory.users.get(userId));
}

async function findUserByEmail(email) {
  const e = cleanEmail(email);
  if (!e) return null;

  if (db.enabled) {
    const u = await db.User.findOne({ email: e });
    return u;
  }

  for (const u of memory.users.values()) {
    if (u.email === e) return u;
  }
  return null;
}

async function saveUser(raw) {
  if (db.enabled && raw && typeof raw.save === "function") {
    await raw.save();
    return publicUser(raw);
  }

  memory.users.set(Number(raw.userId), raw);
  return publicUser(raw);
}

async function createUser(payload = {}) {
  const userId = await nextUserId();
  const raw = {
    userId,
    nickname: cleanNickname(payload.nickname),
    email: cleanEmail(payload.email),
    passwordHash: payload.passwordHash || "",
    avatar: cleanAvatar(payload.avatar),
    country: payload.country || "GE",
    language: payload.language || "Georgian",
    clanId: "",
    clanTag: "",
    stats: { ...DEFAULT_STATS },
    inventory: { items: ["roomNames"], frames: [], crystals: 0 },
    settings: { allowMessages: true, roomInvites: true, seekingRoom: false, music: true, sfx: true },
    createdAt: now(),
    lastLoginAt: now()
  };

  if (db.enabled) {
    const doc = await db.User.create(raw);
    return publicUser(doc);
  }

  memory.users.set(userId, raw);
  return publicUser(raw);
}

async function updateUser(userId, patch = {}) {
  const id = Number(userId);

  if (db.enabled) {
    const u = await db.User.findOne({ userId: id });
    if (!u) return null;

    if (patch.nickname !== undefined) u.nickname = cleanNickname(patch.nickname);
    if (patch.avatar !== undefined) u.avatar = cleanAvatar(patch.avatar);
    if (patch.settings) u.settings = { ...(u.settings || {}), ...patch.settings };
    if (patch.stats) u.stats = { ...(u.stats || {}), ...patch.stats };
    await u.save();
    return publicUser(u);
  }

  const u = memory.users.get(id);
  if (!u) return null;
  if (patch.nickname !== undefined) u.nickname = cleanNickname(patch.nickname);
  if (patch.avatar !== undefined) u.avatar = cleanAvatar(patch.avatar);
  if (patch.settings) u.settings = { ...(u.settings || {}), ...patch.settings };
  if (patch.stats) u.stats = { ...(u.stats || {}), ...patch.stats };
  memory.users.set(id, u);
  return publicUser(u);
}

/* -----------------------------
   Game engine
------------------------------ */

const ROLES = [
  { key: "citizen", label: "Citizen", team: "city", desc: "Peaceful resident. Finds Mafia by discussion and voting.", basic: true },
  { key: "mafia", label: "Mafia", team: "mafia", desc: "Kills citizens at night.", basic: true },
  { key: "don", label: "Don", team: "mafia", desc: "Mafia leader. Can check Sheriff.", basic: false },
  { key: "doctor", label: "Doctor", team: "city", desc: "Saves one player at night.", basic: true },
  { key: "sheriff", label: "Sheriff", team: "city", desc: "Checks whether a player is Mafia.", basic: true },
  { key: "detective", label: "Detective", team: "city", desc: "Investigates suspicious players.", basic: false },
  { key: "bodyguard", label: "Bodyguard", team: "city", desc: "Protects a player from attack.", basic: false },
  { key: "serial_killer", label: "Serial Killer", team: "solo", desc: "Kills at night and wins alone.", basic: false },
  { key: "fortune_teller", label: "Fortune Teller", team: "city", desc: "Reveals hidden truth from fallen players.", basic: false },
  { key: "lady", label: "Lady", team: "city", desc: "Can silence one player.", basic: false },
  { key: "spy", label: "Spy", team: "mafia", desc: "Helps Mafia deceive the city.", basic: false },
  { key: "bulletproof", label: "Bulletproof", team: "city", desc: "Citizen with one night protection.", basic: false },
  { key: "lawyer", label: "Lawyer", team: "mafia", desc: "Protects one Mafia-side player from Sheriff check.", basic: false },
  { key: "priest", label: "Priest", team: "city", desc: "Can bless one player and block one night kill.", basic: false },
  { key: "witch", label: "Witch", team: "solo", desc: "Confuses one player at night and redirects their action.", basic: false },
  { key: "judge", label: "Judge", team: "city", desc: "Has stronger vote weight during the vote phase.", basic: false },
  { key: "jester", label: "Jester", team: "solo", desc: "Wins if the city votes them out.", basic: false },
  { key: "tracker", label: "Tracker", team: "city", desc: "Learns who a target visited at night.", basic: false },
  { key: "godfather", label: "Godfather", team: "mafia", desc: "Mafia boss who appears innocent to checks.", basic: false }
];

const ROLE_MAP = Object.fromEntries(ROLES.map(r => [r.key, r]));

const DEFAULT_SETTINGS = {
  maxPlayers: 10,
  minPlayers: 4,
  language: "Georgian",
  timers: {
    lobby: 0,
    roleReveal: 8,
    night: 45,
    day: 90,
    nomination: 35,
    vote: 35,
    lastWords: 25,
    results: 8
  },
  options: {
    revealRoles: false,
    noNominationFirstDay: true,
    speakerRotation: true,
    generalDiscussion: true,
    spectatorMode: true,
    lastWords: true,
    drawRevote: true
  },
  roles: {
    mafia: 1,
    don: 0,
    doctor: 1,
    sheriff: 1,
    detective: 0,
    bodyguard: 0,
    serial_killer: 0,
    fortune_teller: 0,
    lady: 0,
    spy: 0,
    bulletproof: 0,
    citizen: 0
  }
};

const rooms = new Map();
const socketRooms = new Map();
const onlineUsers = new Map();

function roomId() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function uid(prefix = "id") {
  return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

function normalizeSettings(input = {}) {
  const maxPlayers = clamp(Number(input.maxPlayers || input.players || DEFAULT_SETTINGS.maxPlayers), 4, 16);

  const roles = {
    ...DEFAULT_SETTINGS.roles,
    ...(input.roles || {})
  };

  roles.doctor = 1;
  roles.sheriff = 1;
  roles.mafia = clamp(Number(roles.mafia || 1), 1, Math.max(1, Math.floor(maxPlayers / 3)));
  roles.don = clamp(Number(roles.don || 0), 0, 1);
  roles.detective = clamp(Number(roles.detective || 0), 0, 1);
  roles.bodyguard = clamp(Number(roles.bodyguard || 0), 0, 1);
  roles.serial_killer = clamp(Number(roles.serial_killer || 0), 0, 1);
  roles.fortune_teller = clamp(Number(roles.fortune_teller || 0), 0, 1);
  roles.lady = clamp(Number(roles.lady || 0), 0, 1);
  roles.spy = clamp(Number(roles.spy || 0), 0, 1);
  roles.bulletproof = clamp(Number(roles.bulletproof || 0), 0, 1);
  roles.lawyer = clamp(Number(roles.lawyer || 0), 0, 1);
  roles.priest = clamp(Number(roles.priest || 0), 0, 1);
  roles.witch = clamp(Number(roles.witch || 0), 0, 1);
  roles.judge = clamp(Number(roles.judge || 0), 0, 1);
  roles.jester = clamp(Number(roles.jester || 0), 0, 1);
  roles.tracker = clamp(Number(roles.tracker || 0), 0, 1);
  roles.godfather = clamp(Number(roles.godfather || 0), 0, 1);

  const specialCount = Object.entries(roles)
    .filter(([k]) => k !== "citizen")
    .reduce((a, [, v]) => a + Number(v || 0), 0);

  roles.citizen = Math.max(0, maxPlayers - specialCount);

  return {
    maxPlayers,
    minPlayers: 4,
    language: safeText(input.language, DEFAULT_SETTINGS.language),
    timers: { ...DEFAULT_SETTINGS.timers, ...(input.timers || {}) },
    options: { ...DEFAULT_SETTINGS.options, ...(input.options || {}) },
    roles
  };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));
}

function createRoom(host, payload = {}) {
  if (!host?.userId) throw new Error("Not authenticated");

  const id = roomId();
  const settings = normalizeSettings(payload.settings || { maxPlayers: payload.maxPlayers, language: payload.language });
  const room = {
    id,
    name: safeText(payload.name, "VOID TABLE").slice(0, 48),
    phase: "waiting",
    phaseLabel: "Lobby",
    day: 0,
    timer: 0,
    hostUserId: Number(host.userId),
    hostName: host.nickname,
    settings,
    players: [],
    spectators: [],
    chat: [],
    mafiaChat: [],
    events: [],
    nominations: {},
    nominatedIds: [],
    votes: {},
    nightActions: {},
    lastKilled: [],
    createdAt: now().toISOString()
  };

  addPlayer(room, host, null);
  rooms.set(id, room);
  logEvent(room, `Room created by ${host.nickname}.`);
  return room;
}

function addPlayer(room, user, socketId) {
  if (!room) throw new Error("Room not found");
  if (!user?.userId) throw new Error("Not authenticated");

  let player = room.players.find(p => Number(p.userId) === Number(user.userId));
  if (player) {
    player.socketId = socketId || player.socketId;
    player.connected = true;
    return player;
  }

  if (room.players.length >= room.settings.maxPlayers) throw new Error("Room is full");
  if (room.phase !== "waiting") {
    if (!room.settings.options.spectatorMode) throw new Error("Game already started");
    return addSpectator(room, user, socketId);
  }

  player = {
    id: uid("p"),
    socketId,
    userId: Number(user.userId),
    nickname: user.nickname,
    avatar: user.avatar || "◆",
    clanTag: user.clanTag || "",
    seat: room.players.length + 1,
    role: "",
    team: "",
    alive: true,
    connected: true,
    micOn: true,
    cameraOn: true,
    speaking: false,
    protected: false,
    bulletUsed: false,
    lastAction: null
  };

  room.players.push(player);
  return player;
}

function addSpectator(room, user, socketId) {
  let sp = room.spectators.find(s => Number(s.userId) === Number(user.userId));
  if (sp) {
    sp.socketId = socketId;
    sp.connected = true;
    return sp;
  }
  sp = {
    id: uid("s"),
    socketId,
    userId: Number(user.userId),
    nickname: user.nickname,
    avatar: user.avatar || "◆",
    connected: true
  };
  room.spectators.push(sp);
  return sp;
}

function publicRoom(room, viewerId = 0) {
  const viewer = room.players.find(p => Number(p.userId) === Number(viewerId));
  const isHost = Number(room.hostUserId) === Number(viewerId);
  const reveal = room.settings.options.revealRoles || room.phase === "ended";

  return {
    id: room.id,
    name: room.name,
    phase: room.phase,
    phaseLabel: room.phaseLabel,
    day: room.day,
    timer: room.timer,
    hostUserId: room.hostUserId,
    hostName: room.hostName,
    settings: room.settings,
    players: room.players.map(p => ({
      id: p.id,
      socketId: p.socketId,
      userId: p.userId,
      nickname: p.nickname,
      avatar: p.avatar,
      clanTag: p.clanTag,
      seat: p.seat,
      alive: p.alive,
      connected: p.connected,
      micOn: p.micOn,
      cameraOn: p.cameraOn,
      speaking: p.speaking,
      role: reveal || p.userId === viewerId ? p.role : "",
      team: reveal || p.userId === viewerId ? p.team : ""
    })),
    spectators: room.spectators.map(s => ({ userId: s.userId, nickname: s.nickname, avatar: s.avatar, connected: s.connected })),
    chat: room.chat.slice(-100),
    mafiaChat: viewer?.team === "mafia" || isHost ? room.mafiaChat.slice(-100) : [],
    events: room.events.slice(-100),
    lastKilled: room.lastKilled || [],
    nominatedIds: room.nominatedIds || [],
    viewer: {
      isHost,
      role: viewer?.role || "",
      team: viewer?.team || "",
      alive: viewer?.alive !== false,
      playerId: viewer?.id || "",
      spectator: !viewer
    }
  };
}

function roleDeck(settings, count) {
  const roles = [];
  const r = settings.roles || {};

  for (const [key, value] of Object.entries(r)) {
    if (key === "citizen") continue;
    for (let i = 0; i < Number(value || 0); i++) roles.push(key);
  }

  while (roles.length < count) roles.push("citizen");
  return shuffle(roles).slice(0, count);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startGame(room, userId) {
  if (!room) throw new Error("Room not found");
  if (Number(room.hostUserId) !== Number(userId)) throw new Error("Host only");
  if (room.phase !== "waiting") throw new Error("Game already started");
  if (room.players.length < room.settings.minPlayers) throw new Error(`Minimum ${room.settings.minPlayers} players required`);

  const deck = roleDeck(room.settings, room.players.length);
  room.players.forEach((p, i) => {
    p.role = deck[i] || "citizen";
    p.team = ROLE_MAP[p.role]?.team || "city";
    p.alive = true;
    p.protected = false;
    p.bulletUsed = false;
  });

  room.day = 1;
  setPhase(room, "role_reveal");
  logEvent(room, `Game started. Players: ${room.players.map(p => `#${p.seat} ${p.nickname}`).join(", ")}.`);
}

function setPhase(room, phase) {
  room.phase = phase;
  const labels = {
    waiting: "Lobby",
    role_reveal: "Role Reveal",
    night: "Night",
    day: "Day",
    nomination: "Nomination",
    vote: "Vote",
    last_words: "Last Words",
    results: "Results",
    ended: "Ended"
  };

  room.phaseLabel = labels[phase] || phase;
  room.timer = Number(room.settings.timers[
    phase === "role_reveal" ? "roleReveal" :
    phase === "day" ? "day" :
    phase === "nomination" ? "nomination" :
    phase === "vote" ? "vote" :
    phase === "last_words" ? "lastWords" :
    phase === "results" ? "results" :
    phase
  ] || 30);

  if (phase === "night") {
    room.nightActions = {};
    room.players.forEach(p => {
      p.protected = false;
      p.lastAction = null;
    });
  }

  if (phase === "day") {
    resolveNight(room);
  }

  if (phase === "nomination") {
    room.nominations = {};
    room.nominatedIds = [];
  }

  if (phase === "vote") {
    room.votes = {};
  }

  emitRoom(room);
}

async function nextPhase(room) {
  if (!room || room.phase === "ended") return;

  if (checkWin(room)) {
    await finishGame(room);
    return;
  }

  const order = {
    role_reveal: "night",
    night: "day",
    day: "nomination",
    nomination: "vote",
    vote: "results",
    results: "night",
    last_words: "results"
  };

  if (room.phase === "vote") resolveVote(room);

  let next = order[room.phase] || "day";
  if (room.phase === "results") {
    room.day += 1;
    next = "night";
  }

  setPhase(room, next);
}

function alivePlayers(room) {
  return room.players.filter(p => p.alive);
}

function checkWin(room) {
  const alive = alivePlayers(room);
  const mafia = alive.filter(p => p.team === "mafia").length;
  const city = alive.filter(p => p.team === "city").length;
  const solo = alive.filter(p => p.team === "solo").length;

  if (solo === 1 && mafia + city === 0) return "solo";
  if (mafia === 0 && solo === 0) return "city";
  if (mafia >= city && solo === 0) return "mafia";
  return "";
}

async function finishGame(room) {
  const winner = checkWin(room) || "draw";
  room.phase = "ended";
  room.phaseLabel = "Ended";
  room.timer = 0;
  logEvent(room, `Game ended. Winner: ${winner}.`);

  for (const p of room.players) {
    const user = await findUserById(p.userId);
    if (!user) continue;
    const s = { ...DEFAULT_STATS, ...(user.stats || {}) };
    const won = p.team === winner || (winner === "city" && p.team === "city") || (winner === "mafia" && p.team === "mafia") || (winner === "solo" && p.team === "solo");

    s.games += 1;
    s.wins += won ? 1 : 0;
    s.losses += won ? 0 : 1;
    s.survived += p.alive ? 1 : 0;
    s.mafiaGames += p.team === "mafia" ? 1 : 0;
    s.citizenGames += p.team === "city" ? 1 : 0;
    s.xp += won ? 35 : 12;
    s.rating = Math.max(1, Math.min(5, Number(s.rating || 5) + (won ? 0.02 : -0.01)));

    await updateUser(p.userId, { stats: s });
  }

  emitRoom(room);
}

function resolveNight(room) {
  const killed = new Set();
  const protectedIds = new Set();

  for (const [actorId, action] of Object.entries(room.nightActions || {})) {
    const actor = room.players.find(p => p.id === actorId);
    const target = room.players.find(p => p.id === action.targetId);
    if (!actor || !target || !actor.alive || !target.alive) continue;

    if (actor.role === "doctor" || actor.role === "bodyguard" || actor.role === "priest") {
      protectedIds.add(target.id);
      continue;
    }

    if (actor.team === "mafia" || actor.role === "serial_killer" || actor.role === "godfather") {
      killed.add(target.id);
    }
  }

  room.lastKilled = [];
  for (const id of killed) {
    const target = room.players.find(p => p.id === id);
    if (!target) continue;

    if (protectedIds.has(id)) {
      logEvent(room, `${target.nickname} was attacked but survived.`);
      continue;
    }

    if (target.role === "bulletproof" && !target.bulletUsed) {
      target.bulletUsed = true;
      logEvent(room, `${target.nickname}'s bulletproof vest saved them.`);
      continue;
    }

    target.alive = false;
    room.lastKilled.push({ userId: target.userId, seat: target.seat, nickname: target.nickname, role: target.role });
    logEvent(room, `${target.nickname} was killed during the night.`);
  }

  if (!room.lastKilled.length) logEvent(room, "Night passed quietly. No one died.");
}

function resolveVote(room) {
  const counts = {};
  for (const targetId of Object.values(room.votes || {})) {
    if (!targetId || targetId === "abstain") continue;
    counts[targetId] = (counts[targetId] || 0) + 1;
  }

  const winner = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!winner) {
    logEvent(room, "Vote ended with no elimination.");
    return;
  }

  const target = room.players.find(p => p.id === winner[0]);
  if (target && target.alive) {
    target.alive = false;
    room.lastKilled = [{ userId: target.userId, seat: target.seat, nickname: target.nickname, role: target.role, voted: true }];
    if (target.role === "jester") {
      room.phase = "ended";
      room.phaseLabel = "Ended";
      room.timer = 0;
      logEvent(room, `${target.nickname} was voted out as Jester and stole the victory.`);
      return;
    }
    logEvent(room, `${target.nickname} was jailed by vote.`);
  }
}

function playerAction(room, actor, targetId) {
  if (!room || !actor || !actor.alive) return { ok: false, error: "Action not allowed" };
  if (room.phase !== "night") return { ok: false, error: "Night actions only" };

  const target = room.players.find(p => p.id === targetId);
  if (!target) return { ok: false, error: "Target not found" };

  room.nightActions[actor.id] = { targetId, at: Date.now() };
  actor.lastAction = targetId;

  if (actor.role === "sheriff") {
    const protectedByLawyer = Object.entries(room.nightActions || {}).some(([actorId, a]) => {
      const x = room.players.find(p => p.id === actorId);
      return x?.role === "lawyer" && a.targetId === target.id;
    });
    const appearsClean = target.role === "godfather" || protectedByLawyer;
    return { ok: true, privateResult: `${target.nickname}: ${target.team === "mafia" && !appearsClean ? "Mafia side" : "Not Mafia"}` };
  }

  if (actor.role === "don" || actor.role === "godfather") {
    return { ok: true, privateResult: `${target.nickname}: ${target.role === "sheriff" ? "Sheriff" : "Not Sheriff"}` };
  }

  if (actor.role === "tracker") {
    const visited = Object.entries(room.nightActions || {}).find(([_, a]) => a.targetId === target.id);
    const visitor = visited ? room.players.find(p => p.id === visited[0]) : null;
    return { ok: true, privateResult: visitor ? `${target.nickname} was visited by ${visitor.nickname}` : `${target.nickname} was not visited yet` };
  }

  return { ok: true };
}

function playerNominate(room, actor, targetId) {
  if (!room || !actor || !actor.alive) return { ok: false, error: "Nomination not allowed" };
  if (room.phase !== "nomination") return { ok: false, error: "Nomination phase only" };

  const target = room.players.find(p => p.id === targetId);
  if (!target || !target.alive) return { ok: false, error: "Target not found" };
  if (target.id === actor.id) return { ok: false, error: "Cannot nominate yourself" };

  room.nominations[actor.id] = targetId;
  if (!room.nominatedIds.includes(targetId)) {
    room.nominatedIds.push(targetId);
  }
  logEvent(room, `${actor.nickname} nominated ${target.nickname}.`);
  return { ok: true };
}

function playerVote(room, actor, targetId) {
  if (!room || !actor || !actor.alive) return { ok: false, error: "Vote not allowed" };
  if (room.phase !== "vote") return { ok: false, error: "Voting is closed" };

  if (targetId !== "abstain" && room.nominatedIds?.length > 0) {
    if (!room.nominatedIds.includes(targetId)) return { ok: false, error: "Must vote for a nominated player" };
  }

  room.votes[actor.id] = targetId || "abstain";
  return { ok: true };
}

function addChat(room, sender, message, channel = "room") {
  const text = safeText(message).slice(0, 500);
  if (!text) throw new Error("Empty message");

  const msg = {
    id: uid("m"),
    channel,
    userId: sender.userId,
    seat: sender.seat || "",
    nickname: sender.nickname || "Player",
    message: text,
    at: Date.now()
  };

  if (channel === "mafia") room.mafiaChat.push(msg);
  else room.chat.push(msg);

  return msg;
}

function logEvent(room, text) {
  room.events.push({ id: uid("e"), text, at: Date.now() });
  room.events = room.events.slice(-200);
}

function emitRoom(room) {
  for (const p of room.players) {
    if (p.socketId) io.to(p.socketId).emit("room:state", publicRoom(room, p.userId));
  }
  for (const s of room.spectators) {
    if (s.socketId) io.to(s.socketId).emit("room:state", publicRoom(room, s.userId));
  }
  publishRooms();
}

function publishRooms() {
  io.emit("rooms:list", roomsList());
}

function roomsList() {
  return [...rooms.values()]
    .filter(r => r.phase !== "ended")
    .map(r => ({
      id: r.id,
      name: r.name,
      phase: r.phase,
      hostName: r.hostName,
      players: r.players.length,
      maxPlayers: r.settings.maxPlayers,
      language: r.settings.language,
      rating: 4.9
    }));
}

/* -----------------------------
   REST API
------------------------------ */

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    app: "VOID MAFIA",
    version: "19.9-pro-fix",
    db: db.enabled ? "mongodb" : "memory",
    rooms: rooms.size,
    uptime: process.uptime()
  });
});

app.get("/api/roles", (req, res) => {
  res.json({ ok: true, roles: ROLES, defaultSettings: DEFAULT_SETTINGS });
});

app.get("/api/webrtc", (req, res) => {
  const iceServers = process.env.TURN_URL
    ? [{ urls: "stun:stun.l.google.com:19302" }, { urls: process.env.TURN_URL, username: process.env.TURN_USER || "", credential: process.env.TURN_PASS || "" }]
    : [{ urls: "stun:stun.l.google.com:19302" }];

  res.json({ ok: true, iceServers });
});

app.post("/api/auth/guest", async (req, res) => {
  try {
    const user = await createUser({
      nickname: req.body.nickname || "Player",
      avatar: req.body.avatar || "◆"
    });
    req.session.userId = user.userId;
    res.json({ ok: true, user });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const email = cleanEmail(req.body.email);
    const password = String(req.body.password || "");
    if (!email) throw new Error("Email is required");
    if (password.length < 6) throw new Error("Password must be at least 6 characters");

    const exists = await findUserByEmail(email);
    if (exists) throw new Error("Email already registered");

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await createUser({
      nickname: req.body.nickname || email.split("@")[0],
      email,
      passwordHash,
      avatar: req.body.avatar || "◆"
    });

    req.session.userId = user.userId;
    res.json({ ok: true, user });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const raw = await findUserByEmail(req.body.email);
    if (!raw) throw new Error("Invalid email or password");

    const hash = raw.passwordHash || "";
    const ok = await bcrypt.compare(String(req.body.password || ""), hash);
    if (!ok) throw new Error("Invalid email or password");

    raw.lastLoginAt = now();
    const user = await saveUser(raw);

    req.session.userId = user.userId;
    res.json({ ok: true, user });
  } catch (err) {
    res.status(401).json({ ok: false, error: err.message });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/auth/me", async (req, res) => {
  const user = await findUserById(req.session.userId);
  res.json({ ok: true, user });
});

app.put("/api/auth/me", async (req, res) => {
  try {
    const id = req.session.userId || req.body.userId;
    const user = await updateUser(id, {
      nickname: req.body.nickname,
      avatar: req.body.avatar,
      settings: req.body.settings
    });
    if (!user) throw new Error("User not found");
    req.session.userId = user.userId;
    res.json({ ok: true, user });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get("/api/rooms", (req, res) => {
  res.json({ ok: true, rooms: roomsList() });
});

app.get("/api/rooms/:id", (req, res) => {
  const room = rooms.get(String(req.params.id));
  if (!room) return res.status(404).json({ ok: false, error: "Room not found" });
  res.json({ ok: true, room: publicRoom(room, Number(req.query.userId || req.session.userId || 0)) });
});

app.get("/api/leaderboard", async (req, res) => {
  let users = [];
  if (db.enabled) {
    const docs = await db.User.find({}).sort({ "stats.xp": -1 }).limit(50).lean();
    users = docs.map(publicUser);
  } else {
    users = [...memory.users.values()].map(publicUser).sort((a, b) => (b.stats.xp || 0) - (a.stats.xp || 0)).slice(0, 50);
  }
  res.json({ ok: true, users });
});

app.get("/api/users/:id", async (req, res) => {
  const user = await findUserById(req.params.id);
  if (!user) return res.status(404).json({ ok: false, error: "User not found" });
  res.json({ ok: true, user });
});

app.get("/api/clans", async (req, res) => {
  let clans = [];
  if (db.enabled) {
    clans = await db.Clan.find({}).sort({ power: -1 }).limit(100).lean();
  } else {
    clans = [...memory.clans.values()].sort((a, b) => (b.power || 0) - (a.power || 0));
  }
  res.json({ ok: true, clans });
});

app.post("/api/clans", async (req, res) => {
  try {
    const userId = Number(req.session.userId || req.body.user?.userId);
    const user = await findUserById(userId);
    if (!user) throw new Error("Not authenticated");

    const clanId = uid("clan");
    const clan = {
      clanId,
      name: safeText(req.body.name, "VOID CLAN").slice(0, 32),
      tag: safeText(req.body.tag, "VOID").slice(0, 8),
      emblem: cleanAvatar(req.body.emblem || "◆"),
      ownerUserId: user.userId,
      level: 1,
      power: 0,
      members: [{ userId: user.userId, nickname: user.nickname, role: "Owner", joinedAt: now().toISOString() }],
      trophies: { gold: 0, silver: 0, bronze: 0 }
    };

    if (db.enabled) await db.Clan.create(clan);
    else memory.clans.set(clanId, clan);

    await updateUser(user.userId, { clanId, clanTag: clan.tag });
    res.json({ ok: true, clan });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post("/api/clans/:id/join", async (req, res) => {
  try {
    const userId = Number(req.session.userId || req.body.user?.userId);
    const user = await findUserById(userId);
    if (!user) throw new Error("Not authenticated");

    let clan = null;
    if (db.enabled) clan = await db.Clan.findOne({ clanId: req.params.id });
    else clan = memory.clans.get(String(req.params.id));

    if (!clan) throw new Error("Clan not found");

    const members = clan.members || [];
    if (!members.some(m => Number(m.userId) === user.userId)) {
      members.push({ userId: user.userId, nickname: user.nickname, role: "Member", joinedAt: now().toISOString() });
    }

    clan.members = members;
    clan.power = members.length * 5;

    if (db.enabled) await clan.save();
    else memory.clans.set(clan.clanId, clan);

    await updateUser(user.userId, { clanId: clan.clanId, clanTag: clan.tag });
    res.json({ ok: true, clan: typeof clan.toObject === "function" ? clan.toObject() : clan });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get("/api/store", (req, res) => {
  res.json({
    ok: true,
    items: [
      { key: "coins", category: "Coins", title: "Coin Packs", price: 0, description: "Cosmetic currency for frames and room extras." },
      { key: "frames", category: "Frames", title: "Neon Avatar Frames", price: 150, description: "Profile and lobby visual frames." },
      { key: "crystals", category: "Crystals", title: "Crystals", price: 300, description: "Season rewards and clan cosmetics." },
      { key: "personalColors", category: "Items", title: "Personal Colors", price: 80, description: "Custom speaker glow and profile accent." }
    ]
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

/* -----------------------------
   Socket.IO
------------------------------ */

function socketUser(socket) {
  return socket.data.user || null;
}

function roomOf(id) {
  return rooms.get(String(id));
}

function bySocket(room, socketId) {
  return room?.players.find(p => p.socketId === socketId);
}

function spectatorBySocket(room, socketId) {
  return room?.spectators.find(s => s.socketId === socketId);
}

io.on("connection", socket => {
  socket.on("auth", async (payload = {}, cb) => {
    try {
      let user = await findUserById(payload.userId);
      if (!user && payload.nickname) {
        user = await createUser({ nickname: payload.nickname, avatar: payload.avatar || "◆" });
      }
      if (!user) throw new Error("Auth failed");

      socket.data.user = user;
      onlineUsers.set(String(user.userId), { socketId: socket.id, user });
      cb && cb({ ok: true, user });
      publishRooms();
    } catch (err) {
      cb && cb({ ok: false, error: err.message });
    }
  });

  socket.on("room:create", (payload = {}, cb) => {
    try {
      const u = socketUser(socket) || payload.user;
      const room = createRoom(u, payload);
      const p = room.players.find(x => x.userId === Number(u.userId));
      if (p) p.socketId = socket.id;

      socket.join(room.id);
      socketRooms.set(socket.id, room.id);

      cb && cb({ ok: true, room: publicRoom(room, u.userId) });
      emitRoom(room);
    } catch (err) {
      cb && cb({ ok: false, error: err.message });
    }
  });

  socket.on("room:join", (payload = {}, cb) => {
    try {
      const u = socketUser(socket) || payload.user;
      const room = roomOf(payload.roomId);
      if (!room) throw new Error("Room not found");

      const entry = payload.spectator ? addSpectator(room, u, socket.id) : addPlayer(room, u, socket.id);

      socket.join(room.id);
      socketRooms.set(socket.id, room.id);

      cb && cb({ ok: true, spectator: !room.players.some(p => p.userId === u.userId), room: publicRoom(room, u.userId) });
      logEvent(room, `${u.nickname} joined.`);
      emitRoom(room);
    } catch (err) {
      cb && cb({ ok: false, error: err.message });
    }
  });

  socket.on("room:leave", (payload = {}, cb) => {
    try {
      const rid = payload.roomId || socketRooms.get(socket.id);
      const room = roomOf(rid);
      if (!room) throw new Error("Room not found");

      const u = socketUser(socket);
      const isHost = Number(room.hostUserId) === Number(u?.userId);

      socket.leave(room.id);
      socketRooms.delete(socket.id);

      if (isHost) {
        rooms.delete(room.id);
        io.to(room.id).emit("room:terminated", { roomId: room.id });
        publishRooms();
        cb && cb({ ok: true, terminated: true });
        return;
      }

      const p = bySocket(room, socket.id);
      if (p) {
        p.connected = false;
        p.socketId = null;
      }

      room.spectators = room.spectators.filter(s => s.socketId !== socket.id);
      emitRoom(room);
      cb && cb({ ok: true });
    } catch (err) {
      cb && cb({ ok: false, error: err.message });
    }
  });

  socket.on("room:settings", (payload = {}, cb) => {
    try {
      const room = roomOf(payload.roomId);
      if (!room) throw new Error("Room not found");
      const u = socketUser(socket);
      if (Number(room.hostUserId) !== Number(u?.userId || payload.userId)) throw new Error("Host only");
      if (room.phase !== "waiting") throw new Error("Settings are locked after start");

      room.settings = normalizeSettings({ ...room.settings, ...(payload.settings || {}) });
      logEvent(room, "Room settings updated.");
      cb && cb({ ok: true, room: publicRoom(room, u.userId) });
      emitRoom(room);
    } catch (err) {
      cb && cb({ ok: false, error: err.message });
    }
  });

  socket.on("game:start", (payload = {}, cb) => {
    try {
      const room = roomOf(payload.roomId);
      const u = socketUser(socket);
      startGame(room, u?.userId || payload.userId);
      cb && cb({ ok: true });
      emitRoom(room);
    } catch (err) {
      cb && cb({ ok: false, error: err.message });
    }
  });

  socket.on("game:next", async (payload = {}, cb) => {
    try {
      const room = roomOf(payload.roomId);
      const u = socketUser(socket);
      if (Number(room.hostUserId) !== Number(u?.userId)) throw new Error("Host only");
      await nextPhase(room);
      cb && cb({ ok: true });
    } catch (err) {
      cb && cb({ ok: false, error: err.message });
    }
  });

  socket.on("game:action", (payload = {}, cb) => {
    try {
      const room = roomOf(payload.roomId);
      const actor = bySocket(room, socket.id);
      const result = playerAction(room, actor, payload.targetId);
      cb && cb(result);
      emitRoom(room);
    } catch (err) {
      cb && cb({ ok: false, error: err.message });
    }
  });

  socket.on("game:vote", (payload = {}, cb) => {
    try {
      const room = roomOf(payload.roomId);
      const actor = bySocket(room, socket.id);
      const result = playerVote(room, actor, payload.targetId);
      cb && cb(result);
      emitRoom(room);
    } catch (err) {
      cb && cb({ ok: false, error: err.message });
    }
  });

  socket.on("game:nominate", (payload = {}, cb) => {
    try {
      const room = roomOf(payload.roomId);
      const actor = bySocket(room, socket.id);
      const result = playerNominate(room, actor, payload.targetId);
      cb && cb(result);
      if (result.ok) emitRoom(room);
    } catch (err) {
      cb && cb({ ok: false, error: err.message });
    }
  });

  socket.on("chat:send", (payload = {}, cb) => {
    try {
      const room = roomOf(payload.roomId);
      if (!room) throw new Error("Room not found");

      const player = bySocket(room, socket.id);
      const spectator = spectatorBySocket(room, socket.id);
      const user = socketUser(socket);
      const sender = player || spectator || user;
      if (!sender) throw new Error("Not authenticated");

      const channel = payload.channel === "mafia" ? "mafia" : "room";

      if (channel === "mafia") {
        if (!player || player.team !== "mafia") throw new Error("Mafia chat only");
        const msg = addChat(room, player, payload.message, "mafia");
        room.players.filter(p => p.team === "mafia" && p.socketId).forEach(p => io.to(p.socketId).emit("chat:message", msg));
        cb && cb({ ok: true, msg });
        return;
      }

      const msg = addChat(room, sender, payload.message, "room");
      io.to(room.id).emit("chat:message", msg);
      cb && cb({ ok: true, msg });
      emitRoom(room);
    } catch (err) {
      cb && cb({ ok: false, error: err.message });
    }
  });

  socket.on("media:state", payload => {
    const room = roomOf(payload.roomId);
    const p = bySocket(room, socket.id);
    if (!p) return;

    ["micOn", "cameraOn", "speaking"].forEach(k => {
      if (typeof payload[k] === "boolean") p[k] = payload[k];
    });
    emitRoom(room);
  });

  socket.on("webrtc:ready", payload => {
    const room = roomOf(payload.roomId);
    if (!room) return;
    socket.to(room.id).emit("webrtc:peer-ready", { socketId: socket.id });
  });

  socket.on("webrtc:reset", payload => {
    const room = roomOf(payload.roomId);
    if (!room) return;
    socket.to(room.id).emit("webrtc:reset-peer", { socketId: socket.id });
  });

  socket.on("signal:offer", ({ to, signal }) => io.to(to).emit("signal:offer", { from: socket.id, signal }));
  socket.on("signal:answer", ({ to, signal }) => io.to(to).emit("signal:answer", { from: socket.id, signal }));
  socket.on("signal:ice", ({ to, candidate }) => io.to(to).emit("signal:ice", { from: socket.id, candidate }));

  socket.on("disconnect", () => {
    const u = socketUser(socket);
    if (u) onlineUsers.delete(String(u.userId));

    const rid = socketRooms.get(socket.id);
    socketRooms.delete(socket.id);

    const room = rid && roomOf(rid);
    if (!room) return;

    const p = bySocket(room, socket.id);
    if (p) {
      p.connected = false;
      p.speaking = false;
      p.socketId = null;
    }

    room.spectators = room.spectators.filter(s => s.socketId !== socket.id);

    if (room.phase === "waiting" && Number(room.hostUserId) === Number(u?.userId)) {
      rooms.delete(room.id);
      publishRooms();
      return;
    }

    emitRoom(room);
  });
});

setInterval(async () => {
  for (const room of rooms.values()) {
    if (["waiting", "ended"].includes(room.phase)) continue;
    room.timer = Math.max(0, Number(room.timer || 0) - 1);
    if (room.timer <= 0) await nextPhase(room);
    else emitRoom(room);
  }
}, 1000);

connectDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`VOID MAFIA 19.9 Pro Fix running on ${PORT}`);
  });
});
