require("dotenv").config();

const express = require("express");
const http = require("http");
const path = require("path");
const mongoose = require("mongoose");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const ADMIN_IDS = new Set(String(process.env.ADMIN_IDS || "").split(",").map(s => s.trim()).filter(Boolean));
const MONITOR_IDS = new Set(String(process.env.MONITOR_IDS || "").split(",").map(s => s.trim()).filter(Boolean));

let mongoReady = false;
const UserSchema = new mongoose.Schema({
  userId: { type: String, unique: true, index: true },
  nickname: { type: String, index: true },
  avatar: { type: String, default: "♛" },
  clan: { type: String, default: "" },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
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
const ClanSchema = new mongoose.Schema({
  name: String, emblem: String, leaderId: String, members: [String], points: { type: Number, default: 0 }
}, { timestamps: true });
const MatchSchema = new mongoose.Schema({
  roomCode: String,
  roomName: String,
  winner: String,
  mvp: Object,
  players: [Object],
  history: [Object],
  startedAt: Date,
  endedAt: Date
}, { timestamps: true });
const User = mongoose.models.User || mongoose.model("User", UserSchema);
const Clan = mongoose.models.Clan || mongoose.model("Clan", ClanSchema);
const Match = mongoose.models.Match || mongoose.model("Match", MatchSchema);

function calcLevel(xp) { return Math.max(1, Math.floor(Math.sqrt(Number(xp || 0) / 70)) + 1); }
function clean(v) { return String(v || "").trim().slice(0, 40); }
function publicUser(u = {}) {
  return {
    userId: u.userId, nickname: u.nickname, avatar: u.avatar || "♛", clan: u.clan || "",
    xp: u.xp || 0, level: calcLevel(u.xp || 0), games: u.games || 0, wins: u.wins || 0,
    losses: u.losses || 0, mvp: u.mvp || 0, kills: u.kills || 0, saves: u.saves || 0,
    checks: u.checks || 0, correctVotes: u.correctVotes || 0, karma: u.karma || 0
  };
}
async function connectMongo() {
  if (!process.env.MONGODB_URI) return console.log("MongoDB disabled: MONGODB_URI is not set.");
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    mongoReady = true;
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
  }
}
async function loadProfile({ userId, nickname, avatar }) {
  const id = clean(userId || nickname || Math.random().toString(36).slice(2));
  const name = clean(nickname || `Player-${id}`);
  if (!mongoReady) return publicUser({ userId: id, nickname: name, avatar });
  const doc = await User.findOneAndUpdate(
    { userId: id },
    { $set: { nickname: name, avatar: avatar || "♛", lastSeen: new Date() }, $setOnInsert: { xp: 0, games: 0, wins: 0, losses: 0 } },
    { new: true, upsert: true }
  ).lean();
  return publicUser(doc);
}

const rooms = new Map();
const AVATARS = ["♛", "◈", "⬢", "✦", "☾", "♞", "☣", "◆"];
const ROLE_LABELS = { mafia: "მაფია", don: "დონი", sheriff: "შერიფი", doctor: "ექიმი", detective: "დეტექტივი", citizen: "მოქალაქე" };
function roomSnapshot(room) {
  return {
    code: room.code, name: room.name, hostName: room.hostName, language: room.language,
    phase: room.phase, locked: room.locked, ranked: room.ranked, private: room.private,
    playerCount: room.players.length, maxPlayers: room.settings.maxPlayers, spectatorCount: room.spectators.length,
    avgLevel: room.players.length ? Math.round(room.players.reduce((a,p)=>a+(p.profile?.level||1),0)/room.players.length) : 1,
    createdAt: room.createdAt
  };
}
function emitRooms() { io.emit("rooms:list", [...rooms.values()].map(roomSnapshot)); }
function makeRoom(code, hostSocket, settings = {}) {
  const safe = clean(code || Math.floor(100 + Math.random() * 900));
  const profile = hostSocket.data.profile;
  const room = {
    code: safe,
    name: clean(settings.name || `VOID-${safe}`),
    hostId: hostSocket.id,
    hostName: profile.nickname,
    language: settings.language || "Georgian",
    phase: "waiting",
    locked: false,
    private: !!settings.private,
    ranked: !!settings.ranked,
    createdAt: Date.now(),
    startedAt: null,
    timer: null,
    history: [],
    votes: {},
    night: { kills: [], saves: [], checks: [] },
    settings: {
      maxPlayers: Number(settings.maxPlayers || 10),
      mafiaCount: Number(settings.mafiaCount || 1),
      don: settings.don !== false,
      sheriff: settings.sheriff !== false,
      doctor: settings.doctor !== false,
      detective: !!settings.detective,
      spectator: settings.spectator !== false,
      revealRoles: !!settings.revealRoles,
      speakerRotation: settings.speakerRotation !== false,
      discussion: settings.discussion !== false
    },
    players: [], spectators: []
  };
  rooms.set(safe, room);
  return room;
}
function getRoom(code) { return rooms.get(clean(code)); }
function getMember(room, socketId) { return room.players.find(p => p.id === socketId) || room.spectators.find(p => p.id === socketId); }
function isAdmin(socket) { return ADMIN_IDS.has(String(socket.data.profile?.userId || "")); }
function isMonitor(socket) { return isAdmin(socket) || MONITOR_IDS.has(String(socket.data.profile?.userId || "")); }
function canControl(socket, room) { return room && (room.hostId === socket.id || isAdmin(socket)); }
function roomState(room) {
  return {
    code: room.code, name: room.name, phase: room.phase, locked: room.locked, settings: room.settings,
    hostId: room.hostId,
    players: room.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, alive: p.alive, index: p.index, role: room.settings.revealRoles ? p.role : undefined, level: p.profile?.level || 1 })),
    spectators: room.spectators.map(p => ({ id: p.id, name: p.name, avatar: p.avatar })),
    history: room.history.slice(-30),
    privilege: null
  };
}
function pushHistory(room, text, type = "info") {
  const item = { text, type, at: Date.now() };
  room.history.push(item);
  io.to(room.code).emit("game:history", item);
}
function roleDeck(room) {
  const deck = [];
  if (room.settings.don) deck.push("don");
  for (let i=0; i<room.settings.mafiaCount; i++) deck.push("mafia");
  if (room.settings.sheriff) deck.push("sheriff");
  if (room.settings.doctor) deck.push("doctor");
  if (room.settings.detective) deck.push("detective");
  while (deck.length < room.players.length) deck.push("citizen");
  return deck.sort(() => Math.random() - .5);
}
function startTimer(room, seconds, next) {
  clearTimeout(room.timer);
  const endsAt = Date.now() + seconds * 1000;
  io.to(room.code).emit("phase:timer", { seconds, endsAt });
  room.timer = setTimeout(() => next && next(), seconds * 1000);
}
function changePhase(room, phase) {
  room.phase = phase;
  room.votes = {};
  if (phase === "night") room.night = { kills: [], saves: [], checks: [] };
  io.to(room.code).emit("game:state", roomState(room));
  emitRooms();
  if (phase === "night") { pushHistory(room, "ღამის ფაზა დაიწყო", "night"); startTimer(room, 45, () => resolveNight(room)); }
  if (phase === "day") { pushHistory(room, "დღის განხილვა დაიწყო", "day"); startTimer(room, 90, () => changePhase(room, "vote")); }
  if (phase === "vote") { pushHistory(room, "ხმის მიცემა დაიწყო", "vote"); startTimer(room, 35, () => resolveVote(room)); }
}
function checkWin(room) {
  const alive = room.players.filter(p => p.alive);
  const mafia = alive.filter(p => ["mafia", "don"].includes(p.role));
  const town = alive.filter(p => !["mafia", "don"].includes(p.role));
  if (!mafia.length) return endGame(room, "მოქალაქეებმა მოიგეს");
  if (mafia.length >= town.length) return endGame(room, "მაფიამ მოიგო");
  return false;
}
function resolveNight(room) {
  const targetId = room.night.kills[0];
  const saved = room.night.saves.includes(targetId);
  if (targetId && !saved) {
    const target = room.players.find(p => p.id === targetId);
    if (target) { target.alive = false; pushHistory(room, `${target.name} ღამით მოკლეს`, "death"); }
  } else if (targetId && saved) pushHistory(room, "ექიმმა მსხვერპლი გადაარჩინა", "save");
  if (!checkWin(room)) changePhase(room, "day");
}
function resolveVote(room) {
  const tally = {};
  Object.values(room.votes).forEach(id => tally[id] = (tally[id] || 0) + 1);
  const top = Object.entries(tally).sort((a,b)=>b[1]-a[1])[0];
  if (top) {
    const target = room.players.find(p => p.id === top[0]);
    if (target) { target.alive = false; pushHistory(room, `${target.name} გაიყვანეს ხმებით (${top[1]})`, "vote"); }
  } else pushHistory(room, "არავინ გავიდა ხმებით", "vote");
  if (!checkWin(room)) changePhase(room, "night");
}
async function endGame(room, winner) {
  room.phase = "ended";
  clearTimeout(room.timer);
  pushHistory(room, winner, "win");
  const mvp = room.players.slice().sort((a,b)=>(b.alive?1:0)-(a.alive?1:0))[0] || room.players[0];
  io.to(room.code).emit("game:end", { winner, mvp: mvp ? { name: mvp.name, avatar: mvp.avatar } : null, history: room.history });
  if (mongoReady) {
    try {
      await Match.create({ roomCode: room.code, roomName: room.name, winner, mvp: mvp?.profile, players: room.players.map(p => ({ userId:p.profile.userId, name:p.name, role:p.role, alive:p.alive })), history: room.history, startedAt: room.startedAt, endedAt: new Date() });
      for (const p of room.players) await User.updateOne({ userId: p.profile.userId }, { $inc: { games: 1, xp: p.alive ? 60 : 30, wins: winner.includes("მაფი") === ["mafia","don"].includes(p.role) ? 1 : 0, losses: winner.includes("მაფი") === ["mafia","don"].includes(p.role) ? 0 : 1 } });
    } catch (e) { console.error("persist match failed", e.message); }
  }
  emitRooms();
}

app.get("/api/leaderboard", async (req, res) => {
  if (!mongoReady) return res.json([]);
  const users = await User.find().sort({ xp: -1 }).limit(20).lean();
  res.json(users.map(publicUser));
});

io.on("connection", socket => {
  socket.on("profile:init", async data => {
    try {
      const profile = await loadProfile(data || {});
      socket.data.profile = profile;
      socket.emit("profile:ready", { profile, isAdmin: isAdmin(socket), isMonitor: isMonitor(socket) });
    } catch (e) { socket.emit("toast", { text: "პროფილის ჩატვირთვა ვერ მოხერხდა", type: "error" }); }
  });

  socket.on("rooms:get", emitRooms);
  socket.on("get-rooms", emitRooms);

  socket.on("room:join", async data => {
    const profile = socket.data.profile || await loadProfile(data || {});
    socket.data.profile = profile;
    let room = getRoom(data?.code);
    if (!room) room = makeRoom(data?.code, socket, data?.settings || {});
    if (room.locked && room.hostId !== socket.id && !isAdmin(socket)) return socket.emit("toast", { text: "ოთახი დაკეტილია", type: "error" });
    socket.join(room.code);
    socket.data.room = room.code;
    const member = { id: socket.id, name: profile.nickname, avatar: profile.avatar, profile, alive: true, role: null, index: room.players.length + 1 };
    if (data?.spectator) {
      room.spectators = room.spectators.filter(p => p.id !== socket.id);
      room.spectators.push(member);
    } else if (!room.players.some(p => p.id === socket.id)) {
      if (room.players.length >= room.settings.maxPlayers) return socket.emit("toast", { text: "ოთახი სავსეა", type: "error" });
      room.players.push(member);
    }
    socket.emit("room:joined", { code: room.code, state: roomState(room), me: member, isHost: room.hostId === socket.id, isAdmin: isAdmin(socket), isMonitor: isMonitor(socket) });
    socket.to(room.code).emit("webrtc:user-joined", { id: socket.id, name: member.name, avatar: member.avatar, index: member.index });
    io.to(room.code).emit("game:state", roomState(room));
    emitRooms();
  });

  socket.on("room:update-settings", data => {
    const room = getRoom(socket.data.room); if (!canControl(socket, room)) return;
    Object.assign(room.settings, data?.settings || {});
    if (data?.name) room.name = clean(data.name);
    io.to(room.code).emit("game:state", roomState(room)); emitRooms();
  });
  socket.on("room:control", cmd => {
    const room = getRoom(socket.data.room); if (!canControl(socket, room)) return;
    if (cmd === "start") {
      const deck = roleDeck(room); room.players.forEach((p,i) => { p.role = deck[i]; p.alive = true; io.to(p.id).emit("role:assigned", { role: p.role, label: ROLE_LABELS[p.role] || p.role }); });
      room.startedAt = new Date(); changePhase(room, "night");
    }
    if (cmd === "day") changePhase(room, "day");
    if (cmd === "night") changePhase(room, "night");
    if (cmd === "vote") changePhase(room, "vote");
    if (cmd === "lock") { room.locked = true; emitRooms(); io.to(room.code).emit("game:state", roomState(room)); }
    if (cmd === "unlock") { room.locked = false; emitRooms(); io.to(room.code).emit("game:state", roomState(room)); }
    if (cmd === "reset") { room.phase = "waiting"; room.players.forEach(p => { p.alive = true; p.role = null; }); io.to(room.code).emit("game:state", roomState(room)); }
    if (cmd === "end") endGame(room, "თამაში დასრულდა");
  });
  socket.on("night:action", data => {
    const room = getRoom(socket.data.room); const me = room && room.players.find(p => p.id === socket.id); if (!room || !me || !me.alive || room.phase !== "night") return;
    if (["mafia","don"].includes(me.role) && data.targetId) room.night.kills = [data.targetId];
    if (me.role === "doctor" && data.targetId) room.night.saves = [data.targetId];
    if (["sheriff","detective"].includes(me.role) && data.targetId) { const target = room.players.find(p => p.id === data.targetId); socket.emit("toast", { text: target ? `${target.name}: ${["mafia","don"].includes(target.role) ? "შავი" : "სუფთა"}` : "ვერ მოიძებნა", type: "info" }); }
  });
  socket.on("vote:cast", data => { const room = getRoom(socket.data.room); const me = room && room.players.find(p => p.id === socket.id); if (room && me && me.alive && room.phase === "vote") { room.votes[socket.id] = data.targetId; socket.emit("toast", { text: "ხმა მიღებულია", type: "success" }); } });
  socket.on("chat:send", data => { const room = getRoom(socket.data.room); if (!room) return; const me = getMember(room, socket.id); if (!me) return; const tab = ["main","mafia","dead","spectator"].includes(data.tab) ? data.tab : "main"; const msg = { from: me.name, avatar: me.avatar, text: clean(data.text).slice(0,180), tab, at: Date.now() }; if (!msg.text) return; if (tab === "mafia") room.players.filter(p => ["mafia","don"].includes(p.role)).forEach(p => io.to(p.id).emit("chat:message", msg)); else io.to(room.code).emit("chat:message", msg); });
  socket.on("signal:offer", data => io.to(data.to).emit("signal:offer", { from: socket.id, signal: data.signal }));
  socket.on("signal:answer", data => io.to(data.to).emit("signal:answer", { from: socket.id, signal: data.signal }));

  socket.on("disconnect", () => {
    const room = getRoom(socket.data.room); if (!room) return;
    room.players = room.players.filter(p => p.id !== socket.id);
    room.spectators = room.spectators.filter(p => p.id !== socket.id);
    if (room.hostId === socket.id && room.players[0]) room.hostId = room.players[0].id, room.hostName = room.players[0].name;
    socket.to(room.code).emit("webrtc:user-left", { id: socket.id });
    if (!room.players.length && !room.spectators.length) rooms.delete(room.code); else io.to(room.code).emit("game:state", roomState(room));
    emitRooms();
  });
});

connectMongo().finally(() => server.listen(PORT, () => console.log(`VOID MAFIA v9.3 running on ${PORT}`)));
