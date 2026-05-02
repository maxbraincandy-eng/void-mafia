require("dotenv").config();

const path = require("path");
const http = require("http");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 3000;
const VERSION = "14.1.0-compact";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 25000,
  pingInterval: 10000,
  maxHttpBufferSize: 1e6
});

app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || "void_mafia_dev_secret_change_me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 30
  }
}));

app.use((req, res, next) => {
  if (req.path === "/" || req.path.endsWith(".html") || req.path.endsWith(".js") || req.path.endsWith(".css")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});
app.use(express.static(path.join(__dirname, "public"), { etag: false, maxAge: 0 }));

const memory = {
  users: new Map(),
  clans: new Map(),
  rooms: new Map(),
  codes: new Map(),
  nextUserId: Number(process.env.USER_ID_START || 1)
};

const adminIds = String(process.env.ADMIN_IDS || "1").split(",").map(x => x.trim()).filter(Boolean);

const ROLES = [
  { id: "mafia", label: "მაფია", team: "mafia" },
  { id: "don", label: "დონი", team: "mafia" },
  { id: "doctor", label: "ექიმი", team: "city" },
  { id: "sheriff", label: "შერიფი", team: "city" },
  { id: "detective", label: "დეტექტივი", team: "city" },
  { id: "bodyguard", label: "მცველი", team: "city" },
  { id: "journalist", label: "ჟურნალისტი", team: "city" },
  { id: "lawyer", label: "ადვოკატი", team: "city" },
  { id: "vigilante", label: "ვიჯილანტე", team: "city" },
  { id: "serial_killer", label: "სერიული მკვლელი", team: "solo" },
  { id: "maniac", label: "მანიაკი", team: "solo" },
  { id: "yakuza", label: "იაკუზა", team: "mafia" },
  { id: "citizen", label: "მოქალაქე", team: "city" }
];

function safeText(value, max = 80) {
  return String(value || "").replace(/[<>]/g, "").trim().slice(0, max);
}
function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}
function avatar(value) {
  return safeText(value || "◆", 4) || "◆";
}
function now() { return Date.now(); }
function rid() { return String(Math.floor(100000 + Math.random() * 900000)); }

let db = { connected: false, models: {} };

async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return db;

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    const CounterSchema = new mongoose.Schema({ key: { type: String, unique: true }, value: Number }, { timestamps: true });
    const UserSchema = new mongoose.Schema({
      userId: { type: Number, unique: true, index: true },
      username: { type: String, unique: true, sparse: true },
      email: { type: String, unique: true, sparse: true },
      passwordHash: String,
      nickname: String,
      avatar: String,
      provider: { type: String, default: "guest" },
      clanId: String,
      role: { type: String, default: "user" },
      isAdmin: Boolean,
      stats: {
        gamesPlayed: { type: Number, default: 0 },
        wins: { type: Number, default: 0 },
        losses: { type: Number, default: 0 },
        draws: { type: Number, default: 0 },
        mvp: { type: Number, default: 0 },
        xp: { type: Number, default: 0 },
        level: { type: Number, default: 1 }
      },
      matchHistory: [{
        roomId: String, roomName: String, role: String, result: String, survived: Boolean, playedAt: Date
      }],
      lastLoginAt: Date
    }, { timestamps: true });

    const ClanSchema = new mongoose.Schema({
      clanId: { type: String, unique: true, index: true },
      name: String,
      emblem: String,
      leaderUserId: Number,
      leaderName: String,
      members: [Number],
      points: { type: Number, default: 0 },
      wins: { type: Number, default: 0 }
    }, { timestamps: true });

    const CodeSchema = new mongoose.Schema({
      email: { type: String, index: true },
      codeHash: String,
      expiresAt: Date
    }, { timestamps: true });

    db = {
      connected: true,
      models: {
        Counter: mongoose.models.Counter || mongoose.model("Counter", CounterSchema),
        User: mongoose.models.User || mongoose.model("User", UserSchema),
        Clan: mongoose.models.Clan || mongoose.model("Clan", ClanSchema),
        EmailCode: mongoose.models.EmailCode || mongoose.model("EmailCode", CodeSchema)
      }
    };
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection failed, memory fallback enabled:", err.message);
  }
  return db;
}

async function nextUserId() {
  if (!db.connected) return memory.nextUserId++;
  const Counter = db.models.Counter;
  const start = Number(process.env.USER_ID_START || 1);
  const doc = await Counter.findOneAndUpdate(
    { key: "userId" },
    { $setOnInsert: { value: start - 1 }, $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  return doc.value;
}

function publicUser(user) {
  if (!user) return null;
  const u = user.toObject ? user.toObject() : user;
  return {
    userId: Number(u.userId),
    username: u.username || "",
    email: u.email || "",
    nickname: u.nickname || "Player",
    avatar: u.avatar || "◆",
    clanId: u.clanId || "",
    role: u.role || "user",
    isAdmin: !!u.isAdmin,
    stats: u.stats || { gamesPlayed: 0, wins: 0, losses: 0, draws: 0, mvp: 0, xp: 0, level: 1 },
    matchHistory: (u.matchHistory || []).slice(0, 20),
    createdAt: u.createdAt || null,
    lastLoginAt: u.lastLoginAt || null
  };
}

async function getOrCreateUser(input = {}) {
  const nickname = safeText(input.nickname || input.name || "Player", 32) || "Player";
  const email = cleanEmail(input.email);
  const provider = input.provider || (email ? "email" : "guest");
  const av = avatar(input.avatar);
  const userIdInput = input.userId ? Number(input.userId) : null;

  if (db.connected) {
    const User = db.models.User;
    let user = null;
    if (email) user = await User.findOne({ email });
    if (!user && userIdInput) user = await User.findOne({ userId: userIdInput });

    if (!user) {
      const userId = userIdInput || await nextUserId();
      user = await User.create({
        userId, email, nickname, avatar: av, provider,
        isAdmin: adminIds.includes(String(userId)),
        lastLoginAt: new Date()
      });
    } else {
      user.nickname = nickname || user.nickname;
      user.avatar = av || user.avatar;
      user.lastLoginAt = new Date();
      user.isAdmin = adminIds.includes(String(user.userId)) || !!user.isAdmin;
      await user.save();
    }
    return publicUser(user);
  }

  let user = null;
  if (userIdInput) user = memory.users.get(userIdInput);
  if (!user && email) user = [...memory.users.values()].find(x => x.email === email);

  if (!user) {
    const userId = userIdInput || memory.nextUserId++;
    user = {
      userId, email, nickname, avatar: av, provider, clanId: "",
      role: "user", isAdmin: adminIds.includes(String(userId)),
      stats: { gamesPlayed: 0, wins: 0, losses: 0, draws: 0, mvp: 0, xp: 0, level: 1 },
      matchHistory: [], createdAt: new Date(), lastLoginAt: new Date()
    };
    memory.users.set(userId, user);
  } else {
    user.nickname = nickname || user.nickname;
    user.avatar = av || user.avatar;
    user.lastLoginAt = new Date();
  }
  return publicUser(user);
}

async function registerUser({ username, email, password, nickname, avatar: av }) {
  username = safeText(username || "", 32).toLowerCase();
  email = cleanEmail(email);
  nickname = safeText(nickname || username || "Player", 32);
  av = avatar(av);
  if (!email || !password) throw new Error("Email და password აუცილებელია");
  if (password.length < 4) throw new Error("Password მინიმუმ 4 სიმბოლო");
  const passwordHash = await bcrypt.hash(password, 10);

  if (db.connected) {
    const User = db.models.User;
    const exists = await User.findOne({ $or: [{ email }, ...(username ? [{ username }] : [])] });
    if (exists) throw new Error("ეს email ან username უკვე არსებობს");
    const userId = await nextUserId();
    const user = await User.create({
      userId, username, email, passwordHash, nickname, avatar: av, provider: "email",
      isAdmin: adminIds.includes(String(userId)), lastLoginAt: new Date()
    });
    return publicUser(user);
  }

  const exists = [...memory.users.values()].find(u => u.email === email || (username && u.username === username));
  if (exists) throw new Error("ეს email ან username უკვე არსებობს");
  const userId = memory.nextUserId++;
  const user = {
    userId, username, email, passwordHash, nickname, avatar: av, provider: "email",
    clanId: "", role: "user", isAdmin: adminIds.includes(String(userId)),
    stats: { gamesPlayed: 0, wins: 0, losses: 0, draws: 0, mvp: 0, xp: 0, level: 1 },
    matchHistory: [], createdAt: new Date(), lastLoginAt: new Date()
  };
  memory.users.set(userId, user);
  return publicUser(user);
}

async function loginUser({ email, password }) {
  email = cleanEmail(email);
  if (!email || !password) throw new Error("Email და password აუცილებელია");

  let user;
  if (db.connected) user = await db.models.User.findOne({ email });
  else user = [...memory.users.values()].find(u => u.email === email);

  if (!user || !user.passwordHash) throw new Error("მომხმარებელი ვერ მოიძებნა");
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new Error("პაროლი არასწორია");

  user.lastLoginAt = new Date();
  if (db.connected) await user.save();
  return publicUser(user);
}

async function updateProfile(userId, patch = {}) {
  userId = Number(userId);
  const nickname = safeText(patch.nickname || "", 32);
  const av = avatar(patch.avatar || "");
  if (db.connected) {
    const user = await db.models.User.findOne({ userId });
    if (!user) return null;
    if (nickname) user.nickname = nickname;
    if (av) user.avatar = av;
    await user.save();
    return publicUser(user);
  }
  const user = memory.users.get(userId);
  if (!user) return null;
  if (nickname) user.nickname = nickname;
  if (av) user.avatar = av;
  return publicUser(user);
}

async function createClan({ name, owner }) {
  name = safeText(name, 32);
  if (!name) throw new Error("კლანის სახელი აუცილებელია");
  const ownerId = Number(owner.userId);
  if (!ownerId) throw new Error("ჯერ ავტორიზაცია გაიარე");
  const clanId = "clan_" + crypto.randomBytes(4).toString("hex");
  const clan = {
    clanId, name, emblem: owner.avatar || "◆",
    leaderUserId: ownerId, leaderName: owner.nickname || "Player",
    members: [ownerId], points: 0, wins: 0, createdAt: new Date()
  };
  if (db.connected) {
    const c = await db.models.Clan.create(clan);
    await db.models.User.updateOne({ userId: ownerId }, { $set: { clanId } });
    return c.toObject();
  }
  memory.clans.set(clanId, clan);
  const u = memory.users.get(ownerId); if (u) u.clanId = clanId;
  return clan;
}
async function listClans() {
  if (db.connected) return await db.models.Clan.find({}).sort({ points: -1, createdAt: -1 }).lean();
  return [...memory.clans.values()].sort((a,b)=>b.points-a.points);
}
async function leaderboard() {
  if (db.connected) return (await db.models.User.find({}).sort({ "stats.xp": -1 }).limit(100).lean()).map(publicUser);
  return [...memory.users.values()].sort((a,b)=>(b.stats?.xp||0)-(a.stats?.xp||0)).slice(0,100).map(publicUser);
}

function defaultSettings(s = {}) {
  const maxPlayers = Math.min(16, Math.max(4, Number(s.maxPlayers || 10)));
  const roles = Object.assign({
    mafia: 1, don: 0, doctor: 1, sheriff: 1, detective: 0, bodyguard: 0,
    journalist: 0, lawyer: 0, vigilante: 0, serial_killer: 0, maniac: 0, yakuza: 0,
    citizen: Math.max(0, maxPlayers - 3)
  }, s.roles || {});
  return {
    maxPlayers,
    locked: !!s.locked,
    autoStartWhenFull: !!s.autoStartWhenFull,
    timers: Object.assign({ night: 45, day: 60, nomination: 45, vote: 35, lastWords: 35 }, s.timers || {}),
    roles
  };
}
function createRoom({ name, owner, settings }) {
  const id = rid();
  const room = {
    id, name: safeText(name || "VOID TABLE", 42) || "VOID TABLE",
    phase: "waiting", phaseLabel: "მოლოდინი", day: 0, timer: 0,
    hostUserId: owner.userId, hostName: owner.nickname, hostSocketId: null,
    settings: defaultSettings(settings),
    players: [], spectators: [], chat: [], events: [], nominatedIds: [],
    nightActions: {}, votes: {}, gameOver: null, createdAt: now(), updatedAt: now()
  };
  memory.rooms.set(id, room);
  return room;
}
function publicRoom(room) {
  return {
    id: room.id, name: room.name, phase: room.phase, phaseLabel: room.phaseLabel,
    players: room.players.length, maxPlayers: room.settings.maxPlayers, hostName: room.hostName,
    locked: room.settings.locked, createdAt: room.createdAt
  };
}
function serializeRoom(room, socketId = null) {
  const viewer = room.players.find(p => p.socketId === socketId) || room.spectators.find(s => s.socketId === socketId);
  return {
    id: room.id, name: room.name, phase: room.phase, phaseLabel: room.phaseLabel,
    day: room.day, timer: room.timer, alive: room.players.filter(p => p.alive).length,
    hostUserId: room.hostUserId, hostName: room.hostName, settings: room.settings,
    players: room.players.map(p => ({
      id: p.id, userId: p.userId, socketId: p.socketId, seat: p.seat, nickname: p.nickname,
      avatar: p.avatar, connected: p.connected, alive: p.alive, micOn: p.micOn, cameraOn: p.cameraOn,
      role: viewer && (viewer.userId === p.userId || room.phase === "game_over") ? p.role : null
    })),
    spectators: room.spectators.map(s => ({ userId: s.userId, nickname: s.nickname, avatar: s.avatar, socketId: s.socketId })),
    chat: room.chat.slice(-100), events: room.events.slice(-80), nominatedIds: room.nominatedIds,
    gameOver: room.gameOver,
    viewer: viewer ? { userId: viewer.userId, isHost: String(viewer.userId) === String(room.hostUserId), role: viewer.role || null } : null
  };
}
function event(room, text, type = "info") {
  room.events.push({ at: now(), text: safeText(text, 240), type });
  if (room.events.length > 160) room.events.shift();
}
function assignRoles(room) {
  const list = [];
  for (const [role, count] of Object.entries(room.settings.roles || {})) {
    for (let i = 0; i < Number(count || 0); i++) list.push(role);
  }
  while (list.length < room.players.length) list.push("citizen");
  list.length = room.players.length;
  list.sort(() => Math.random() - 0.5);
  room.players.forEach((p, i) => {
    p.role = list[i] || "citizen";
    p.alive = true;
  });
}
function startGame(room) {
  if (room.players.length < 1) return { ok: false, error: "მოთამაშეები არ არის" };
  assignRoles(room);
  room.phase = "night"; room.phaseLabel = "ღამე"; room.day = 1; room.timer = room.settings.timers.night;
  room.nightActions = {}; room.votes = {}; room.nominatedIds = [];
  event(room, "თამაში დაიწყო. ღამე დადგა.", "start");
  return { ok: true, room };
}
function endGame(room, label) {
  room.phase = "game_over"; room.phaseLabel = "დასასრული"; room.gameOver = { label, at: now() };
  event(room, "თამაში დასრულდა: " + label, "end");
}
function checkWin(room) {
  const alive = room.players.filter(p => p.alive);
  const mafia = alive.filter(p => ["mafia","don","yakuza"].includes(p.role)).length;
  const others = alive.length - mafia;
  if (mafia <= 0) return endGame(room, "ქალაქმა მოიგო");
  if (mafia >= others) return endGame(room, "მაფიამ მოიგო");
}
setInterval(() => {
  for (const room of memory.rooms.values()) {
    if (!["night","day","nomination","vote","last_words"].includes(room.phase)) continue;
    room.timer = Math.max(0, Number(room.timer || 0) - 1);
    if (room.timer > 0) continue;
    if (room.phase === "night") {
      room.phase = "day"; room.phaseLabel = "დღე"; room.timer = room.settings.timers.day; event(room, "გათენდა. განხილვა დაიწყო.", "phase");
    } else if (room.phase === "day") {
      room.phase = "nomination"; room.phaseLabel = "დასახელება"; room.timer = room.settings.timers.nomination; event(room, "კანდიდატების დასახელება.", "phase");
    } else if (room.phase === "nomination") {
      room.phase = "vote"; room.phaseLabel = "ხმა"; room.timer = room.settings.timers.vote; event(room, "ხმის მიცემა დაიწყო.", "phase");
    } else if (room.phase === "vote") {
      room.phase = "night"; room.phaseLabel = "ღამე"; room.day += 1; room.timer = room.settings.timers.night; room.votes = {}; room.nominatedIds = []; event(room, "ღამე დადგა.", "phase");
    } else {
      room.phase = "night"; room.phaseLabel = "ღამე"; room.timer = room.settings.timers.night;
    }
    checkWin(room);
    io.to(room.id).emit("room:state", serializeRoom(room));
  }
}, 1000);

function mailer() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

app.get("/health", (req, res) => {
  res.json({ ok: true, app: "VOID MAFIA", version: VERSION, mongodb: db.connected ? "connected" : "memory", rooms: memory.rooms.size });
});

app.post("/api/auth/guest", async (req, res) => {
  try {
    const user = await getOrCreateUser(req.body || {});
    req.session.user = user;
    res.json({ ok: true, user });
  } catch (err) { res.status(400).json({ ok: false, error: err.message }); }
});
app.post("/api/auth/register", async (req, res) => {
  try {
    const user = await registerUser(req.body || {});
    req.session.user = user;
    res.json({ ok: true, user });
  } catch (err) { res.status(400).json({ ok: false, error: err.message }); }
});
app.post("/api/auth/login", async (req, res) => {
  try {
    const user = await loginUser(req.body || {});
    req.session.user = user;
    res.json({ ok: true, user });
  } catch (err) { res.status(401).json({ ok: false, error: err.message }); }
});
app.get("/api/auth/me", (req, res) => res.json({ ok: true, user: req.session.user || null }));
app.post("/api/auth/email-code", async (req, res) => {
  try {
    const email = cleanEmail(req.body.email);
    if (!email) return res.status(400).json({ ok: false, error: "Email აუცილებელია" });
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, 8);
    const ttl = Number(process.env.EMAIL_CODE_TTL_MIN || 10);
    const expiresAt = new Date(Date.now() + ttl * 60000);
    if (db.connected) {
      await db.models.EmailCode.deleteMany({ email });
      await db.models.EmailCode.create({ email, codeHash, expiresAt });
    } else memory.codes.set(email, { codeHash, expiresAt });
    const t = mailer();
    if (t) await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to: email, subject: "VOID MAFIA code", text: `Your code: ${code}` });
    console.log("Email code for", email, code);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ ok: false, error: "კოდის გაგზავნა ვერ მოხერხდა" }); }
});
app.post("/api/profile", async (req, res) => {
  try {
    const userId = req.body.userId || req.session.user?.userId;
    const user = await updateProfile(userId, req.body);
    if (!user) return res.status(404).json({ ok: false, error: "მომხმარებელი ვერ მოიძებნა" });
    req.session.user = user;
    res.json({ ok: true, user });
  } catch (err) { res.status(400).json({ ok: false, error: err.message }); }
});
app.get("/api/rooms", (req, res) => res.json({ ok: true, rooms: [...memory.rooms.values()].map(publicRoom) }));
app.get("/api/clans", async (req, res) => res.json({ ok: true, clans: await listClans() }));
app.post("/api/clans", async (req, res) => {
  try { res.json({ ok: true, clan: await createClan({ name: req.body.name, owner: req.body.user || req.session.user || {} }) }); }
  catch (err) { res.status(400).json({ ok: false, error: err.message }); }
});
app.get("/api/leaderboard", async (req, res) => res.json({ ok: true, users: await leaderboard() }));
app.get("/api/roles", (req, res) => res.json({ ok: true, roles: ROLES }));

io.on("connection", socket => {
  function roomOf(id) { return memory.rooms.get(String(id)); }
  function playerBySocket(room) { return room?.players.find(p => p.socketId === socket.id); }
  function isHost(room, userId) {
    const p = playerBySocket(room);
    return (p && p.seat === 1) || String(userId || p?.userId) === String(room.hostUserId);
  }
  function publishRoom(room) {
    for (const s of io.sockets.adapter.rooms.get(room.id) || []) io.to(s).emit("room:state", serializeRoom(room, s));
    io.emit("rooms:update", [...memory.rooms.values()].map(publicRoom));
  }

  socket.on("auth:guest", async (payload = {}, cb) => {
    try { cb && cb({ ok: true, user: await getOrCreateUser(payload) }); }
    catch (err) { cb && cb({ ok: false, error: err.message }); }
  });

  socket.on("rooms:get", cb => cb && cb({ ok: true, rooms: [...memory.rooms.values()].map(publicRoom) }));

  socket.on("room:create", async (payload = {}, cb) => {
    try {
      const user = await getOrCreateUser(payload.user || {});
      const room = createRoom({ name: payload.name || payload.settings?.name, owner: user, settings: payload.settings || {} });
      const player = { id: crypto.randomBytes(4).toString("hex"), socketId: socket.id, userId: user.userId, seat: 1, nickname: user.nickname, avatar: user.avatar, connected: true, alive: true, role: null, micOn: true, cameraOn: true };
      room.players.push(player); room.hostSocketId = socket.id;
      socket.join(room.id);
      event(room, "#1 " + player.nickname + " შემოვიდა.", "join");
      cb && cb({ ok: true, user, room: serializeRoom(room, socket.id) });
      publishRoom(room);
    } catch (err) { cb && cb({ ok: false, error: err.message }); }
  });

  socket.on("room:join", async (payload = {}, cb) => {
    try {
      const room = roomOf(payload.roomId);
      if (!room) return cb && cb({ ok: false, error: "ოთახი ვერ მოიძებნა" });
      const user = await getOrCreateUser(payload.user || {});
      socket.join(room.id);
      const spectator = !!payload.spectator || room.phase !== "waiting";
      if (spectator) {
        if (!room.spectators.some(s => String(s.userId) === String(user.userId))) room.spectators.push({ ...user, socketId: socket.id });
        cb && cb({ ok: true, spectator: true, user, room: serializeRoom(room, socket.id) });
        return publishRoom(room);
      }
      let player = room.players.find(p => String(p.userId) === String(user.userId));
      if (player) { player.socketId = socket.id; player.connected = true; }
      else {
        if (room.players.length >= room.settings.maxPlayers) return cb && cb({ ok: false, error: "ოთახი სავსეა" });
        player = { id: crypto.randomBytes(4).toString("hex"), socketId: socket.id, userId: user.userId, seat: room.players.length + 1, nickname: user.nickname, avatar: user.avatar, connected: true, alive: true, role: null, micOn: true, cameraOn: true };
        room.players.push(player);
      }
      if (player.seat === 1) { room.hostUserId = player.userId; room.hostSocketId = socket.id; room.hostName = player.nickname; }
      event(room, `#${player.seat} ${player.nickname} შემოვიდა.`, "join");
      cb && cb({ ok: true, spectator: false, user, room: serializeRoom(room, socket.id) });
      publishRoom(room);
    } catch (err) { cb && cb({ ok: false, error: err.message }); }
  });

  socket.on("room:settings", (payload = {}, cb) => {
    try {
      const room = roomOf(payload.roomId);
      if (!room) return cb && cb({ ok: false, error: "ოთახი ვერ მოიძებნა" });
      if (!isHost(room, payload.userId)) return cb && cb({ ok: false, error: "მხოლოდ ჰოსტს შეუძლია" });
      room.settings = defaultSettings(Object.assign({}, room.settings, payload.settings || {}));
      if (payload.name) room.name = safeText(payload.name, 42);
      event(room, "ოთახის პარამეტრები შეიცვალა.", "settings");
      cb && cb({ ok: true, room: serializeRoom(room, socket.id) });
      publishRoom(room);
    } catch (err) { cb && cb({ ok: false, error: err.message }); }
  });

  socket.on("game:start", (payload = {}, cb) => {
    const room = roomOf(payload.roomId);
    if (!room) return cb && cb({ ok: false, error: "ოთახი ვერ მოიძებნა" });
    if (!isHost(room, payload.userId)) return cb && cb({ ok: false, error: "მხოლოდ ჰოსტს შეუძლია" });
    const res = startGame(room); cb && cb(res); publishRoom(room);
  });

  socket.on("chat:send", (payload = {}, cb) => {
    try {
      const room = roomOf(payload.roomId);
      if (!room) return cb && cb({ ok: false, error: "ოთახი ვერ მოიძებნა" });
      const player = playerBySocket(room);
      const spectator = room.spectators.find(s => s.socketId === socket.id);
      const sender = player || spectator;
      if (!sender) return cb && cb({ ok: false, error: "ჯერ ოთახში უნდა იყო" });
      const message = safeText(payload.message, 240);
      if (!message) return cb && cb({ ok: false, error: "ცარიელი მესიჯი ვერ გაიგზავნება" });
      const msg = { at: now(), userId: sender.userId, seat: player ? player.seat : null, nickname: sender.nickname, avatar: sender.avatar, message };
      room.chat.push(msg); if (room.chat.length > 160) room.chat.shift();
      io.to(room.id).emit("chat:message", msg);
      cb && cb({ ok: true, message: msg });
    } catch (err) { cb && cb({ ok: false, error: "ჩატის შეცდომა" }); }
  });

  socket.on("media:state", (payload = {}) => {
    const room = roomOf(payload.roomId); const p = playerBySocket(room); if (!room || !p) return;
    if (typeof payload.micOn === "boolean") p.micOn = payload.micOn;
    if (typeof payload.cameraOn === "boolean") p.cameraOn = payload.cameraOn;
    publishRoom(room);
  });

  socket.on("game:nightAction", (payload = {}, cb) => {
    const room = roomOf(payload.roomId); const p = playerBySocket(room);
    if (!room || !p || room.phase !== "night") return cb && cb({ ok: false, error: "ახლა ღამის ფაზა არ არის" });
    room.nightActions[p.id] = payload.targetId; cb && cb({ ok: true }); event(room, `${p.nickname} მოქმედება დააფიქსირა.`, "action");
  });
  socket.on("game:nominate", (payload = {}, cb) => {
    const room = roomOf(payload.roomId); const p = playerBySocket(room);
    if (!room || !p || room.phase !== "nomination") return cb && cb({ ok: false, error: "ახლა დასახელება არ არის" });
    if (!room.nominatedIds.includes(payload.targetId)) room.nominatedIds.push(payload.targetId);
    cb && cb({ ok: true }); publishRoom(room);
  });
  socket.on("game:vote", (payload = {}, cb) => {
    const room = roomOf(payload.roomId); const p = playerBySocket(room);
    if (!room || !p || room.phase !== "vote") return cb && cb({ ok: false, error: "ახლა ხმის მიცემა არ არის" });
    room.votes[p.id] = payload.targetId; cb && cb({ ok: true }); event(room, `${p.nickname} ხმა დააფიქსირა.`, "vote");
  });

  socket.on("signal:offer", ({ to, signal }) => io.to(to).emit("signal:offer", { from: socket.id, signal }));
  socket.on("signal:answer", ({ to, signal }) => io.to(to).emit("signal:answer", { from: socket.id, signal }));
  socket.on("signal:ice", ({ to, candidate }) => io.to(to).emit("signal:ice", { from: socket.id, candidate }));

  socket.on("disconnect", () => {
    for (const room of memory.rooms.values()) {
      const p = room.players.find(x => x.socketId === socket.id);
      if (p) { p.connected = false; event(room, `#${p.seat} კავშირი გაწყდა.`, "leave"); publishRoom(room); }
      room.spectators = room.spectators.filter(s => s.socketId !== socket.id);
    }
  });
});

app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

connectDb().then(() => {
  server.listen(PORT, () => {
    console.log(`VOID MAFIA ${VERSION} running on ${PORT}`);
    console.log(db.connected ? "MongoDB enabled" : "MongoDB disabled: memory fallback enabled");
  });
});
