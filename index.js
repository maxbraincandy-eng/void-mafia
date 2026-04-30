require("dotenv").config();

const express = require("express");
const http = require("http");
const crypto = require("crypto");
const path = require("path");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const mongoose = require("mongoose");
const { Server } = require("socket.io");

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
const PORT = process.env.PORT || 3000;
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const MAIL_FROM = process.env.MAIL_FROM || SMTP_USER || "VOID MAFIA <no-reply@void-mafia.local>";
const EMAIL_CODE_TTL_MIN = Number(process.env.EMAIL_CODE_TTL_MIN || 10);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || "dev_secret_change_me",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 30
  }
}));
app.use(passport.initialize());
app.use(passport.session());

const ADMIN_IDS = new Set(String(process.env.ADMIN_IDS || "").split(",").map(s => s.trim()).filter(Boolean));
const MONITOR_IDS = new Set(String(process.env.MONITOR_IDS || "").split(",").map(s => s.trim()).filter(Boolean));
let mongoReady = false;
let memoryUserSeq = Number(process.env.USER_ID_START || 1) - 1;

const UserSchema = new mongoose.Schema({
  userId: { type: Number, unique: true, index: true },
  nickname: { type: String, default: "", index: true },
  email: { type: String, unique: true, sparse: true, index: true },
  passwordHash: { type: String, default: "" },
  googleId: { type: String, unique: true, sparse: true, index: true },
  facebookId: { type: String, unique: true, sparse: true, index: true },
  avatar: { type: String, default: "♛" },
  clan: { type: String, default: "" },
  title: { type: String, default: "Rookie" },
  xp: { type: Number, default: 0 },
  games: { type: Number, default: 0 },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  mvp: { type: Number, default: 0 },
  kills: { type: Number, default: 0 },
  saves: { type: Number, default: 0 },
  checks: { type: Number, default: 0 },
  correctVotes: { type: Number, default: 0 },
  karma: { type: Number, default: 0 },
  lastSeen: { type: Date, default: Date.now }
}, { timestamps: true });
const CounterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } });
const MatchSchema = new mongoose.Schema({
  roomCode: String, roomName: String, winner: String, mvp: Object, players: [Object], history: [Object], startedAt: Date, endedAt: Date
}, { timestamps: true });
const ClanSchema = new mongoose.Schema({
  name: String, emblem: String, leaderId: Number, members: [Number], points: { type: Number, default: 0 }
}, { timestamps: true });
const EmailVerificationSchema = new mongoose.Schema({
  email: { type: String, unique: true, index: true },
  nickname: { type: String, default: "" },
  avatar: { type: String, default: "♛" },
  passwordHash: { type: String, required: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, index: { expires: 0 } },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.models.User || mongoose.model("User", UserSchema);
const Counter = mongoose.models.Counter || mongoose.model("Counter", CounterSchema);
const Match = mongoose.models.Match || mongoose.model("Match", MatchSchema);
const Clan = mongoose.models.Clan || mongoose.model("Clan", ClanSchema);
const EmailVerification = mongoose.models.EmailVerification || mongoose.model("EmailVerification", EmailVerificationSchema);

function calcLevel(xp) { return Math.max(1, Math.floor(Math.sqrt(Number(xp || 0) / 70)) + 1); }
function clean(v, max = 60) { return String(v || "").trim().slice(0, max); }
function normEmail(email) { return String(email || "").trim().toLowerCase(); }
function isAdminId(id) { return ADMIN_IDS.has(String(id)); }
function isMonitorId(id) { return isAdminId(id) || MONITOR_IDS.has(String(id)); }
function makeCode() { return String(Math.floor(100000 + Math.random() * 900000)); }
function hashCode(email, code) {
  return crypto.createHash("sha256").update(normEmail(email) + ":" + String(code)).digest("hex");
}
function mailConfigured() { return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS); }
function getTransporter() {
  if (!mailConfigured()) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
}
async function sendVerificationEmail(email, code) {
  const transporter = getTransporter();
  if (!transporter) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEV EMAIL CODE] ${email}: ${code}`);
      return { dev: true };
    }
    throw new Error("Email sender is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM.");
  }
  await transporter.sendMail({
    from: MAIL_FROM,
    to: email,
    subject: "VOID MAFIA verification code",
    text: "Your VOID MAFIA verification code is: " + code + "\n\nThe code expires in " + EMAIL_CODE_TTL_MIN + " minutes.",
    html: '<div style="font-family:Arial,sans-serif;background:#08020f;color:#fff;padding:24px;border-radius:14px"><h2 style="color:#00ffff">VOID MAFIA</h2><p>Your verification code:</p><div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#ff00ff">' + code + '</div><p style="color:#aaa">This code expires in ' + EMAIL_CODE_TTL_MIN + ' minutes.</p></div>'
  });
  return { dev: false };
}

function publicUser(u = {}) {
  return {
    id: u._id?.toString?.() || undefined,
    userId: u.userId,
    nickname: u.nickname || `Player-${u.userId || ""}`,
    email: u.email || "",
    avatar: u.avatar || "♛",
    clan: u.clan || "",
    title: u.title || "Rookie",
    xp: u.xp || 0,
    level: calcLevel(u.xp || 0),
    games: u.games || 0,
    wins: u.wins || 0,
    losses: u.losses || 0,
    mvp: u.mvp || 0,
    kills: u.kills || 0,
    saves: u.saves || 0,
    checks: u.checks || 0,
    correctVotes: u.correctVotes || 0,
    karma: u.karma || 0,
    isAdmin: isAdminId(u.userId),
    isMonitor: isMonitorId(u.userId)
  };
}
async function nextUserId() {
  if (!mongoReady) return ++memoryUserSeq;
  const start = Number(process.env.USER_ID_START || 1);
  let counter = await Counter.findById("users");
  if (!counter) {
    try { await Counter.create({ _id: "users", seq: start - 1 }); } catch (_) {}
  }
  counter = await Counter.findOneAndUpdate({ _id: "users" }, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return counter.seq;
}
async function connectMongo() {
  if (!process.env.MONGODB_URI) {
    console.log("MongoDB disabled: MONGODB_URI is not set.");
    return;
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    mongoReady = true;
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
  }
}
async function createUser(data) {
  const user = await User.create({ userId: await nextUserId(), ...data, lastSeen: new Date() });
  return user;
}
async function findOrCreateOAuthUser({ provider, providerId, email, displayName }) {
  const field = provider === "google" ? "googleId" : "facebookId";
  const query = { [field]: providerId };
  let user = await User.findOne(query);
  if (!user && email) user = await User.findOne({ email });
  if (!user) {
    user = await createUser({
      [field]: providerId,
      email: email || undefined,
      nickname: clean(displayName || `Player-${Date.now()}`, 40),
      avatar: "♛"
    });
  } else {
    user[field] = providerId;
    if (!user.email && email) user.email = email;
    user.lastSeen = new Date();
    await user.save();
  }
  return user;
}

passport.serializeUser((user, done) => done(null, user._id.toString()));
passport.deserializeUser(async (id, done) => {
  try { done(null, await User.findById(id)); } catch (err) { done(err); }
});
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${APP_BASE_URL}/auth/google/callback`
  }, async (_access, _refresh, profile, done) => {
    try {
      const email = normEmail(profile.emails?.[0]?.value || "");
      const user = await findOrCreateOAuthUser({ provider: "google", providerId: profile.id, email, displayName: profile.displayName });
      done(null, user);
    } catch (err) { done(err); }
  }));
  app.get("/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
  app.get("/auth/google/callback", passport.authenticate("google", { failureRedirect: "/?auth=failed" }), (req, res) => res.redirect("/?auth=success"));
}
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: `${APP_BASE_URL}/auth/facebook/callback`,
    profileFields: ["id", "displayName", "emails"]
  }, async (_access, _refresh, profile, done) => {
    try {
      const email = normEmail(profile.emails?.[0]?.value || "");
      const user = await findOrCreateOAuthUser({ provider: "facebook", providerId: profile.id, email, displayName: profile.displayName });
      done(null, user);
    } catch (err) { done(err); }
  }));
  app.get("/auth/facebook", passport.authenticate("facebook", { scope: ["email"] }));
  app.get("/auth/facebook/callback", passport.authenticate("facebook", { failureRedirect: "/?auth=failed" }), (req, res) => res.redirect("/?auth=success"));
}

app.post("/api/auth/register", async (req, res) => {
  try {
    if (!mongoReady) return res.status(503).json({ ok: false, error: "MongoDB is required for registration." });
    const email = normEmail(req.body.email);
    const password = String(req.body.password || "");
    const nickname = clean(req.body.nickname, 40);
    const avatar = clean(req.body.avatar || "♛", 6);
    if (!email || !password || !nickname) return res.status(400).json({ ok: false, error: "Email, password and nickname are required." });
    if (password.length < 6) return res.status(400).json({ ok: false, error: "Password must be at least 6 characters." });
    if (await User.findOne({ email })) return res.status(409).json({ ok: false, error: "This email is already registered. Use login instead." });

    const code = makeCode();
    const passwordHash = await bcrypt.hash(password, 12);
    const expiresAt = new Date(Date.now() + EMAIL_CODE_TTL_MIN * 60 * 1000);
    await EmailVerification.findOneAndUpdate(
      { email },
      { email, nickname, avatar, passwordHash, codeHash: hashCode(email, code), attempts: 0, expiresAt, createdAt: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const mailInfo = await sendVerificationEmail(email, code);
    res.json({ ok: true, needsCode: true, devCode: mailInfo.dev ? code : undefined, message: "Verification code sent to email." });
  } catch (err) {
    console.error("register/send-code error", err);
    res.status(500).json({ ok: false, error: err.message || "Verification code could not be sent." });
  }
});

app.post("/api/auth/verify", async (req, res) => {
  try {
    if (!mongoReady) return res.status(503).json({ ok: false, error: "MongoDB is required for registration." });
    const email = normEmail(req.body.email);
    const code = String(req.body.code || "").trim();
    if (!email || !code) return res.status(400).json({ ok: false, error: "Email and code are required." });

    const pending = await EmailVerification.findOne({ email });
    if (!pending) return res.status(404).json({ ok: false, error: "Verification request not found. Register again." });
    if (pending.expiresAt && pending.expiresAt.getTime() < Date.now()) {
      await EmailVerification.deleteOne({ email });
      return res.status(410).json({ ok: false, error: "Verification code expired. Register again." });
    }
    if (pending.attempts >= 5) {
      await EmailVerification.deleteOne({ email });
      return res.status(429).json({ ok: false, error: "Too many wrong attempts. Register again." });
    }
    if (pending.codeHash !== hashCode(email, code)) {
      pending.attempts += 1;
      await pending.save();
      return res.status(401).json({ ok: false, error: "Invalid verification code." });
    }
    if (await User.findOne({ email })) {
      await EmailVerification.deleteOne({ email });
      return res.status(409).json({ ok: false, error: "This email is already registered. Use login instead." });
    }

    const user = await createUser({ email, passwordHash: pending.passwordHash, nickname: pending.nickname, avatar: pending.avatar });
    await EmailVerification.deleteOne({ email });
    req.login(user, err => err ? res.status(500).json({ ok: false, error: "Login failed after verification." }) : res.json({ ok: true, user: publicUser(user) }));
  } catch (err) {
    console.error("verify error", err);
    res.status(500).json({ ok: false, error: "Verification failed." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = normEmail(req.body.email);
    const password = String(req.body.password || "");
    const user = await User.findOne({ email });
    if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ ok: false, error: "Invalid email or password." });
    }
    user.lastSeen = new Date();
    await user.save();
    req.login(user, err => err ? res.status(500).json({ ok: false, error: "Login failed." }) : res.json({ ok: true, user: publicUser(user) }));
  } catch (err) {
    console.error("login error", err);
    res.status(500).json({ ok: false, error: "Login failed." });
  }
});
app.post("/api/auth/guest", async (req, res) => {
  try {
    const nickname = clean(req.body.nickname || "Guest", 40);
    const avatar = clean(req.body.avatar || "♛", 6);
    const user = mongoReady ? await createUser({ nickname, avatar }) : { userId: await nextUserId(), nickname, avatar };
    if (mongoReady) req.login(user, () => res.json({ ok: true, user: publicUser(user) }));
    else res.json({ ok: true, user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ ok: false, error: "Guest profile failed." });
  }
});
app.post("/api/auth/logout", (req, res) => req.logout(err => err ? res.status(500).json({ ok: false }) : res.json({ ok: true })));
app.get("/api/auth/me", (req, res) => res.json({ ok: true, user: req.user ? publicUser(req.user) : null }));
app.post("/api/profile/avatar", async (req, res) => {
  try {
    if (!req.user) return res.status(401).json({ ok: false, error: "Login required." });
    req.user.avatar = clean(req.body.avatar || req.user.avatar || "♛", 6);
    await req.user.save();
    res.json({ ok: true, user: publicUser(req.user) });
  } catch (e) { res.status(500).json({ ok: false }); }
});
app.get("/api/leaderboard", async (_req, res) => {
  if (!mongoReady) return res.json([]);
  const users = await User.find().sort({ xp: -1 }).limit(30).lean();
  res.json(users.map(publicUser));
});
app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();
const ROLE_META = {
  citizen: { label: "მოქალაქე", team: "town", desc: "დღით ამოიცანი ბოროტი გუნდები და მიეცი სწორი ხმა." },
  mafia: { label: "მაფია", team: "mafia", desc: "ღამით მაფიის გუნდთან ერთად აირჩიე მსხვერპლი." },
  don: { label: "დონი", team: "mafia", desc: "მაფიის ლიდერი. შერიფის შემოწმებაზე სუფთად გამოჩნდება." },
  sheriff: { label: "შერიფი", team: "town", desc: "ღამით ამოწმებ მოთამაშეს: საეჭვოა თუ სუფთა." },
  doctor: { label: "ექიმი", team: "town", desc: "ღამით იცავ ერთ მოთამაშეს მკვლელობისგან." },
  detective: { label: "დეტექტივი", team: "town", desc: "ღამით იგებ მოთამაშემ იმოქმედა თუ არა და რომელ გუნდს ჰგავს." },
  serial_killer: { label: "სერიული მკვლელი", team: "solo", desc: "მარტოხელა მკვლელი. ღამით კლავ ერთ მოთამაშეს და მარტო იგებ." },
  yakuza: { label: "იაკუძა", team: "yakuza", desc: "ცალკე ბოროტი გუნდი. ღამით ირჩევ მსხვერპლს." },
  chogun: { label: "ჩოგუნი", team: "yakuza", desc: "იაკუძას დამხმარე. შერიფისთვის სუფთად ჩანს." },
  vigilante: { label: "ვიჯილანტი", team: "town", desc: "მოქალაქეთა მხარე. ღამით შეგიძლია ერთხელ მოკვლა." },
  maniac: { label: "მანიაკი", team: "chaos", desc: "ღამით ერთ მოთამაშეს აბლოკავ: მეორე დღეს ჩატი/ქმედება ეზღუდება." }
};
function defaultSettings(settings = {}) {
  return {
    maxPlayers: Math.max(4, Math.min(16, Number(settings.maxPlayers || 10))),
    private: !!settings.private,
    spectator: settings.spectator !== false,
    revealRoles: !!settings.revealRoles,
    speakerRotation: settings.speakerRotation !== false,
    discussion: settings.discussion !== false,
    mafiaCount: Math.max(1, Math.min(4, Number(settings.mafiaCount || 1))),
    don: settings.don !== false,
    sheriff: settings.sheriff !== false,
    doctor: settings.doctor !== false,
    detective: !!settings.detective,
    serialKiller: !!settings.serialKiller,
    yakuza: !!settings.yakuza,
    chogun: !!settings.chogun,
    vigilante: !!settings.vigilante,
    maniac: !!settings.maniac
  };
}
function roomSnapshot(room) {
  return {
    code: room.code, name: room.name, hostName: room.hostName, phase: room.phase, locked: room.locked,
    private: room.settings.private, playerCount: room.players.length, maxPlayers: room.settings.maxPlayers,
    spectatorCount: room.spectators.length, avgLevel: room.players.length ? Math.round(room.players.reduce((a,p)=>a+(p.profile.level || 1),0)/room.players.length) : 1,
    createdAt: room.createdAt
  };
}
function emitRooms() { io.emit("rooms:list", [...rooms.values()].map(roomSnapshot)); }
function getRoom(code) { return rooms.get(clean(code, 30)); }
function makeRoom(code, socket, settings = {}) {
  const safe = clean(code || Math.floor(100 + Math.random() * 900), 30);
  const profile = socket.data.profile;
  const room = {
    code: safe,
    name: clean(settings.name || `VOID-${safe}`, 50),
    hostId: socket.id,
    hostName: profile.nickname,
    language: "Georgian",
    phase: "waiting",
    locked: false,
    createdAt: Date.now(),
    startedAt: null,
    timer: null,
    history: [],
    votes: {},
    night: {},
    used: { vigilante: new Set() },
    settings: defaultSettings(settings),
    players: [],
    spectators: []
  };
  rooms.set(safe, room);
  return room;
}
function reindexRoom(room) {
  room.players.forEach((p, i) => { p.index = i + 1; });
  if (room.players[0]) { room.hostId = room.players[0].id; room.hostName = room.players[0].name; }
}
function getMember(room, sid) { return room.players.find(p => p.id === sid) || room.spectators.find(p => p.id === sid); }
function isAdminSocket(socket) { return isAdminId(socket.data.profile?.userId); }
function isMonitorSocket(socket) { return isMonitorId(socket.data.profile?.userId); }
function canControl(socket, room) {
  if (!room) return false;
  const me = room.players.find(p => p.id === socket.id);
  return !!((me && me.index === 1) || isAdminSocket(socket));
}
function rolePublic(room, p) { return room.settings.revealRoles || room.phase === "ended" ? p.role : undefined; }
function roomState(room) {
  return {
    code: room.code, name: room.name, phase: room.phase, locked: room.locked, settings: room.settings, hostId: room.hostId,
    players: room.players.map(p => ({ id: p.id, userId: p.profile.userId, name: p.name, avatar: p.avatar, alive: p.alive, index: p.index, role: rolePublic(room, p), level: p.profile.level || 1, muted: !!p.muted })),
    spectators: room.spectators.map(p => ({ id: p.id, userId: p.profile.userId, name: p.name, avatar: p.avatar })),
    history: room.history.slice(-40)
  };
}
function pushHistory(room, text, type = "info") {
  const item = { text, type, at: Date.now() };
  room.history.push(item);
  io.to(room.code).emit("game:history", item);
}
function buildDeck(room) {
  const s = room.settings;
  const deck = [];
  if (s.don) deck.push("don");
  for (let i = 0; i < s.mafiaCount; i++) deck.push("mafia");
  if (s.yakuza) deck.push("yakuza");
  if (s.chogun) deck.push("chogun");
  if (s.serialKiller) deck.push("serial_killer");
  if (s.sheriff) deck.push("sheriff");
  if (s.doctor) deck.push("doctor");
  if (s.detective) deck.push("detective");
  if (s.vigilante) deck.push("vigilante");
  if (s.maniac) deck.push("maniac");
  while (deck.length < room.players.length) deck.push("citizen");
  return deck.sort(() => Math.random() - 0.5);
}
function teamOf(role) { return ROLE_META[role]?.team || "town"; }
function evilVisibleToSheriff(role) { return ["mafia", "yakuza", "serial_killer"].includes(role); }
function resetNight(room) {
  room.night = { mafia: {}, yakuza: {}, serial: {}, vigilante: {}, saves: {}, blocks: {}, actions: [] };
  room.players.forEach(p => { p.lastNightAction = null; p.muted = false; });
}
function topVote(obj) {
  const tally = {};
  Object.values(obj || {}).forEach(id => { if (id) tally[id] = (tally[id] || 0) + 1; });
  return Object.entries(tally).sort((a,b) => b[1] - a[1])[0]?.[0] || null;
}
function startTimer(room, seconds, cb) {
  clearTimeout(room.timer);
  const endsAt = Date.now() + seconds * 1000;
  io.to(room.code).emit("phase:timer", { seconds, endsAt });
  room.timer = setTimeout(() => cb && cb(), seconds * 1000);
}
function changePhase(room, phase) {
  room.phase = phase;
  if (phase === "night") resetNight(room);
  if (phase === "vote") room.votes = {};
  io.to(room.code).emit("game:state", roomState(room));
  emitRooms();
  if (phase === "night") { pushHistory(room, "ღამის ფაზა დაიწყო", "night"); startTimer(room, 55, () => resolveNight(room)); }
  if (phase === "day") { pushHistory(room, "დღის განხილვა დაიწყო", "day"); startTimer(room, 100, () => changePhase(room, "vote")); }
  if (phase === "vote") { pushHistory(room, "ხმის მიცემა დაიწყო", "vote"); startTimer(room, 40, () => resolveVote(room)); }
}
function aliveByTeam(room, team) { return room.players.filter(p => p.alive && teamOf(p.role) === team); }
function checkWin(room) {
  const alive = room.players.filter(p => p.alive);
  if (alive.length === 0) return endGame(room, "არავინ გადარჩა");
  const serial = aliveByTeam(room, "solo");
  const mafia = aliveByTeam(room, "mafia");
  const yakuza = aliveByTeam(room, "yakuza");
  const town = aliveByTeam(room, "town");
  const chaos = aliveByTeam(room, "chaos");
  if (serial.length && alive.length === 1) return endGame(room, "სერიულმა მკვლელმა მოიგო");
  if (mafia.length && mafia.length >= alive.length - mafia.length) return endGame(room, "მაფიამ მოიგო");
  if (yakuza.length && yakuza.length >= alive.length - yakuza.length) return endGame(room, "იაკუძამ მოიგო");
  if (!mafia.length && !yakuza.length && !serial.length && !chaos.length) return endGame(room, "მოქალაქეებმა მოიგეს");
  return false;
}
function killPlayer(room, targetId, reason, savedSet) {
  if (!targetId) return;
  const target = room.players.find(p => p.id === targetId && p.alive);
  if (!target) return;
  if (savedSet.has(targetId)) {
    pushHistory(room, `ექიმმა ${target.name} გადაარჩინა`, "save");
    return;
  }
  target.alive = false;
  pushHistory(room, `${target.name} მოკლეს (${reason})`, "death");
}
function resolveNight(room) {
  const savedSet = new Set(Object.values(room.night.saves || {}));
  Object.values(room.night.blocks || {}).forEach(id => {
    const t = room.players.find(p => p.id === id);
    if (t) { t.muted = true; pushHistory(room, `${t.name} მანიაკმა დაბლოკა`, "chaos"); }
  });
  killPlayer(room, topVote(room.night.mafia), "მაფია", savedSet);
  killPlayer(room, topVote(room.night.yakuza), "იაკუძა", savedSet);
  killPlayer(room, topVote(room.night.serial), "სერიული მკვლელი", savedSet);
  killPlayer(room, topVote(room.night.vigilante), "ვიჯილანტი", savedSet);
  if (!checkWin(room)) changePhase(room, "day");
}
function resolveVote(room) {
  const targetId = topVote(room.votes);
  if (targetId) {
    const target = room.players.find(p => p.id === targetId && p.alive);
    if (target) { target.alive = false; pushHistory(room, `${target.name} გავიდა ხმებით`, "vote"); }
  } else pushHistory(room, "ხმის მიცემით არავინ გავიდა", "vote");
  if (!checkWin(room)) changePhase(room, "night");
}
async function persistStats(room, winner, mvp) {
  if (!mongoReady) return;
  const mafiaWin = winner.includes("მაფი");
  const yakuzaWin = winner.includes("იაკუძ");
  const serialWin = winner.includes("სერიულ");
  const townWin = winner.includes("მოქალაქ");
  await Match.create({ roomCode: room.code, roomName: room.name, winner, mvp: mvp?.profile, players: room.players.map(p => ({ userId:p.profile.userId, name:p.name, role:p.role, alive:p.alive })), history: room.history, startedAt: room.startedAt, endedAt: new Date() });
  for (const p of room.players) {
    const team = teamOf(p.role);
    const won = (mafiaWin && team === "mafia") || (yakuzaWin && team === "yakuza") || (serialWin && team === "solo") || (townWin && team === "town");
    await User.updateOne({ userId: p.profile.userId }, { $inc: { games: 1, xp: won ? 90 : 35, wins: won ? 1 : 0, losses: won ? 0 : 1, mvp: mvp?.profile?.userId === p.profile.userId ? 1 : 0 } });
  }
}
async function endGame(room, winner) {
  room.phase = "ended";
  clearTimeout(room.timer);
  pushHistory(room, winner, "win");
  const mvp = room.players.slice().sort((a,b) => (b.alive ? 1 : 0) - (a.alive ? 1 : 0))[0] || room.players[0];
  await persistStats(room, winner, mvp).catch(e => console.error("persist failed", e.message));
  io.to(room.code).emit("game:end", { winner, mvp: mvp ? { name: mvp.name, avatar: mvp.avatar, userId: mvp.profile.userId } : null, history: room.history });
  io.to(room.code).emit("game:state", roomState(room));
  emitRooms();
  return true;
}
async function profileForSocket(socket, fallback = {}) {
  if (socket.request?.user) return publicUser(socket.request.user);
  if (socket.data.profile) return socket.data.profile;
  const userId = Number(fallback.userId || 0);
  if (mongoReady && userId) {
    const doc = await User.findOne({ userId });
    if (doc) return publicUser(doc);
  }
  return publicUser({ userId: await nextUserId(), nickname: clean(fallback.nickname || "Guest", 40), avatar: clean(fallback.avatar || "♛", 6) });
}

io.use((socket, next) => {
  session({ secret: process.env.SESSION_SECRET || "dev_secret_change_me", resave: false, saveUninitialized: false })(socket.request, {}, () => passport.initialize()(socket.request, {}, () => passport.session()(socket.request, {}, next)));
});
io.on("connection", socket => {
  socket.on("profile:init", async data => {
    try {
      const profile = await profileForSocket(socket, data || {});
      socket.data.profile = profile;
      socket.emit("profile:ready", { profile, isAdmin: isAdminId(profile.userId), isMonitor: isMonitorId(profile.userId) });
    } catch (e) { socket.emit("toast", { text: "პროფილი ვერ ჩაიტვირთა", type: "error" }); }
  });
  socket.on("rooms:get", emitRooms);

  socket.on("room:join", async data => {
    try {
      const profile = socket.data.profile || await profileForSocket(socket, data || {});
      socket.data.profile = profile;
      let room = getRoom(data?.code);
      if (!room) room = makeRoom(data?.code, socket, data?.settings || {});
      if (room.locked && !isAdminId(profile.userId)) return socket.emit("toast", { text: "მაგიდა დაკეტილია", type: "error" });
      socket.join(room.code);
      socket.data.room = room.code;
      const member = { id: socket.id, name: profile.nickname, avatar: profile.avatar, profile, alive: true, role: null, index: room.players.length + 1, muted: false, lastNightAction: null };
      if (data?.spectator) {
        if (!room.settings.spectator) return socket.emit("toast", { text: "ყურება გამორთულია", type: "error" });
        room.spectators = room.spectators.filter(p => p.id !== socket.id);
        room.spectators.push(member);
      } else if (!room.players.some(p => p.id === socket.id)) {
        if (room.players.length >= room.settings.maxPlayers) return socket.emit("toast", { text: "მაგიდა სავსეა", type: "error" });
        room.players.push(member);
        reindexRoom(room);
      }
      const me = room.players.find(p => p.id === socket.id) || member;
      socket.emit("room:joined", { code: room.code, state: roomState(room), me: { ...me, userId: profile.userId }, isHost: me.index === 1, isAdmin: isAdminId(profile.userId), isMonitor: isMonitorId(profile.userId) });
      socket.to(room.code).emit("webrtc:user-joined", { id: socket.id, userId: profile.userId, name: member.name, avatar: member.avatar, index: me.index });
      io.to(room.code).emit("game:state", roomState(room));
      emitRooms();
    } catch (e) { console.error("join failed", e); socket.emit("toast", { text: "მაგიდაში შესვლა ვერ მოხერხდა", type: "error" }); }
  });
  socket.on("room:update-settings", data => {
    const room = getRoom(socket.data.room); if (!canControl(socket, room) || room.phase !== "waiting") return socket.emit("toast", { text: "პარამეტრები მხოლოდ მზადების დროს იცვლება", type: "error" });
    room.settings = defaultSettings({ ...room.settings, ...(data?.settings || {}) });
    if (data?.name) room.name = clean(data.name, 50);
    pushHistory(room, "მაგიდის პარამეტრები განახლდა", "info");
    io.to(room.code).emit("game:state", roomState(room)); emitRooms();
  });
  socket.on("room:control", cmd => {
    const room = getRoom(socket.data.room); if (!canControl(socket, room)) return;
    if (cmd === "start") {
      if (room.players.length < 4) return socket.emit("toast", { text: "მინიმუმ 4 მოთამაშეა საჭირო", type: "error" });
      const deck = buildDeck(room);
      if (deck.length > room.players.length) return socket.emit("toast", { text: "ჩართული როლები მოთამაშეებზე მეტია", type: "error" });
      room.players.forEach((p, i) => { p.role = deck[i]; p.alive = true; p.muted = false; io.to(p.id).emit("role:assigned", { role: p.role, meta: ROLE_META[p.role] }); });
      room.startedAt = new Date(); changePhase(room, "night");
    }
    if (cmd === "day") changePhase(room, "day");
    if (cmd === "night") changePhase(room, "night");
    if (cmd === "vote") changePhase(room, "vote");
    if (cmd === "lock") { room.locked = true; emitRooms(); io.to(room.code).emit("game:state", roomState(room)); }
    if (cmd === "unlock") { room.locked = false; emitRooms(); io.to(room.code).emit("game:state", roomState(room)); }
    if (cmd === "reset") { room.phase = "waiting"; clearTimeout(room.timer); room.players.forEach(p => { p.alive = true; p.role = null; p.muted = false; }); io.to(room.code).emit("game:state", roomState(room)); emitRooms(); }
    if (cmd === "end") endGame(room, "თამაში დასრულდა");
  });
  socket.on("night:action", data => {
    const room = getRoom(socket.data.room); const me = room && room.players.find(p => p.id === socket.id);
    if (!room || !me || !me.alive || room.phase !== "night") return;
    const targetId = data?.targetId;
    const target = room.players.find(p => p.id === targetId);
    if (!target || !target.alive || target.id === me.id && !["doctor"].includes(me.role)) return;
    me.lastNightAction = { role: me.role, targetId };
    if (["mafia", "don"].includes(me.role)) room.night.mafia[me.id] = targetId;
    else if (["yakuza", "chogun"].includes(me.role)) room.night.yakuza[me.id] = targetId;
    else if (me.role === "doctor") room.night.saves[me.id] = targetId;
    else if (me.role === "serial_killer") room.night.serial[me.id] = targetId;
    else if (me.role === "vigilante") { if (room.used.vigilante.has(me.id)) return socket.emit("toast", { text: "ვიჯილანტის გასროლა უკვე გამოყენებულია", type: "error" }); room.used.vigilante.add(me.id); room.night.vigilante[me.id] = targetId; }
    else if (me.role === "maniac") room.night.blocks[me.id] = targetId;
    else if (me.role === "sheriff") return socket.emit("toast", { text: `${target.name}: ${evilVisibleToSheriff(target.role) ? "საეჭვოა" : "სუფთაა"}`, type: "info" });
    else if (me.role === "detective") return socket.emit("toast", { text: `${target.name}: გუნდი ${teamOf(target.role)}, ბოლო ქმედება ${target.lastNightAction ? "ჰქონდა" : "არ ჩანს"}`, type: "info" });
    socket.emit("toast", { text: "ღამის მოქმედება მიღებულია", type: "success" });
  });
  socket.on("vote:cast", data => {
    const room = getRoom(socket.data.room); const me = room && room.players.find(p => p.id === socket.id);
    if (room && me && me.alive && !me.muted && room.phase === "vote") { room.votes[socket.id] = data.targetId; socket.emit("toast", { text: "ხმა მიღებულია", type: "success" }); }
  });
  socket.on("chat:send", data => {
    const room = getRoom(socket.data.room); if (!room) return;
    const me = getMember(room, socket.id); if (!me) return;
    if (me.muted && room.phase === "day") return socket.emit("toast", { text: "მანიაკმა დაგბლოკა ამ დღეს", type: "error" });
    const tab = ["main", "mafia", "dead", "spectator"].includes(data.tab) ? data.tab : "main";
    const msg = { from: me.name, avatar: me.avatar, text: clean(data.text, 180), tab, at: Date.now() };
    if (!msg.text) return;
    if (tab === "mafia") room.players.filter(p => ["mafia", "don"].includes(p.role)).forEach(p => io.to(p.id).emit("chat:message", msg));
    else io.to(room.code).emit("chat:message", msg);
  });
  socket.on("signal:offer", data => io.to(data.to).emit("signal:offer", { from: socket.id, signal: data.signal }));
  socket.on("signal:answer", data => io.to(data.to).emit("signal:answer", { from: socket.id, signal: data.signal }));
  socket.on("disconnect", () => {
    const room = getRoom(socket.data.room); if (!room) return;
    room.players = room.players.filter(p => p.id !== socket.id);
    room.spectators = room.spectators.filter(p => p.id !== socket.id);
    reindexRoom(room);
    socket.to(room.code).emit("webrtc:user-left", { id: socket.id });
    if (!room.players.length && !room.spectators.length) rooms.delete(room.code); else io.to(room.code).emit("game:state", roomState(room));
    emitRooms();
  });
});

connectMongo().finally(() => server.listen(PORT, () => console.log(`VOID MAFIA v9.5 Auth Engine running on ${PORT}`)));
