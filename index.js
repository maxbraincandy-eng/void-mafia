const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
require("dotenv").config();
const mongoose = require("mongoose");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, "public")));

const rooms = new Map();

/* ============================================================
   V8 MONGODB / PERSISTENT STATS
============================================================ */
let mongoReady = false;
const userSchema = new mongoose.Schema({
  userKey: { type: String, unique: true, index: true }, nickname: { type: String, index: true }, avatar: { type: String, default: "🕶️" },
  level: { type: Number, default: 1 }, xp: { type: Number, default: 0 }, games: { type: Number, default: 0 }, wins: { type: Number, default: 0 }, losses: { type: Number, default: 0 },
  mafiaWins: { type: Number, default: 0 }, citizenWins: { type: Number, default: 0 }, soloWins: { type: Number, default: 0 }, mvp: { type: Number, default: 0 },
  kills: { type: Number, default: 0 }, saves: { type: Number, default: 0 }, checks: { type: Number, default: 0 }, correctVotes: { type: Number, default: 0 }, lastSeen: { type: Date, default: Date.now }
}, { timestamps: true });
const matchSchema = new mongoose.Schema({
  roomCode: String, winnerTeam: String, winnerMessage: String,
  mvp: { userKey: String, nickname: String, avatar: String, score: Number },
  players: [{ userKey: String, nickname: String, avatar: String, role: String, alive: Boolean, won: Boolean, xpGain: Number }],
  history: [{ text: String, type: String, at: Date }], startedAt: Date, endedAt: Date
}, { timestamps: true });
const User = mongoose.models.User || mongoose.model("User", userSchema);
const Match = mongoose.models.Match || mongoose.model("Match", matchSchema);
function userKeyFromName(name) { return cleanName(name).trim().toLowerCase(); }
function levelFromXp(xp) { return Math.max(1, Math.floor(Math.sqrt(Math.max(0, Number(xp || 0)) / 80)) + 1); }
async function connectMongo() {
  if (!process.env.MONGODB_URI) { console.log("MongoDB disabled: MONGODB_URI is not set. Using in-memory profiles only."); return; }
  try { await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 }); mongoReady = true; console.log("MongoDB connected"); }
  catch (err) { mongoReady = false; console.error("MongoDB connection failed:", err.message); }
}
async function loadOrCreateUserProfile(nickname, avatar = "🕶️") {
  const name = cleanName(nickname); const userKey = userKeyFromName(name);
  if (!mongoReady) return { userKey, nickname: name, avatar, level: 1, xp: 0, games: 0, wins: 0, losses: 0, mvp: 0, kills: 0, saves: 0, checks: 0, correctVotes: 0 };
  const doc = await User.findOneAndUpdate({ userKey }, { $set: { nickname: name, avatar: avatar || "🕶️", lastSeen: new Date() }, $setOnInsert: { xp: 0, games: 0, wins: 0, losses: 0, mvp: 0 } }, { new: true, upsert: true }).lean();
  return { ...doc, level: levelFromXp(doc.xp) };
}
function winningTeamFromMessage(message = "") { const msg = String(message).toLowerCase(); if (msg.includes("mafia") || msg.includes("მაფია")) return "mafia"; if (msg.includes("serial") || msg.includes("solo") || msg.includes("სერიულ")) return "solo"; if (msg.includes("citizen") || msg.includes("მოქალაქ")) return "citizen"; return "draw"; }
function playerTeam(role) { if (["mafia", "don"].includes(role)) return "mafia"; if (["serial_killer"].includes(role)) return "solo"; return "citizen"; }
function computeMvp(room, winnerTeam) {
  const candidates = room.players.map(p => { const prof = room.profiles[p.id] || {}; let score = 0; if (playerTeam(p.role) === winnerTeam) score += 20; if (p.alive) score += 10; score += Number(prof.kills || 0) * 4; score += Number(prof.saves || 0) * 3; score += Number(prof.checks || 0) * 3; score += Number(prof.correctVotes || 0) * 2; score += Number(prof.level || 1); return { player: p, prof, score }; }).sort((a,b)=>b.score-a.score);
  const best = candidates[0]; if (!best) return null; return { socketId: best.player.id, userKey: best.prof.userKey || userKeyFromName(best.player.name), nickname: best.player.name, avatar: best.prof.avatar || "🏆", score: best.score };
}
async function persistGameResult(room, winnerMessage) {
  if (!mongoReady || room.statsSaved) return; room.statsSaved = true;
  const winnerTeam = winningTeamFromMessage(winnerMessage); const mvp = computeMvp(room, winnerTeam); const playersForMatch = [];
  for (const p of room.players) { const prof = room.profiles[p.id] || {}; const userKey = prof.userKey || userKeyFromName(p.name); const won = playerTeam(p.role) === winnerTeam; const isMvp = mvp && mvp.socketId === p.id; const xpGain = 30 + (won ? 70 : 10) + (p.alive ? 15 : 0) + (isMvp ? 50 : 0); const inc = { games: 1, wins: won ? 1 : 0, losses: won ? 0 : 1, mvp: isMvp ? 1 : 0, xp: xpGain }; if (won && winnerTeam === "mafia") inc.mafiaWins = 1; if (won && winnerTeam === "citizen") inc.citizenWins = 1; if (won && winnerTeam === "solo") inc.soloWins = 1; await User.findOneAndUpdate({ userKey }, { $set: { nickname: p.name, avatar: prof.avatar || "🕶️", lastSeen: new Date() }, $inc: inc }, { upsert: true }); playersForMatch.push({ userKey, nickname: p.name, avatar: prof.avatar || "🕶️", role: p.role, alive: p.alive, won, xpGain }); io.to(p.id).emit("profile-stats-updated", { won, xpGain, isMvp }); }
  await Match.create({ roomCode: room.code, winnerTeam, winnerMessage, mvp: mvp ? { userKey: mvp.userKey, nickname: mvp.nickname, avatar: mvp.avatar, score: mvp.score } : null, players: playersForMatch, history: room.history.map(h => ({ text: h.text, type: h.type, at: new Date(h.at || Date.now()) })), startedAt: room.startedAt || new Date(room.createdAt || Date.now()), endedAt: new Date() });
}


const ROLE_LABEL = {
  mafia: "მაფია", don: "დონი", doctor: "ექიმი", sheriff: "შერიფი",
  citizen: "მოქალაქე", detective: "დეტექტივი", serial_killer: "სერიული მკვლელი",
  yakuza: "იაკუძა", chogun: "ჩოგუნი", vigilante: "ვიჯილანტი", maniac: "მანიაკი"
};

function makeRoom(code, hostId, hostName) {
  return {
    code,
    hostId,
    hostName,
    createdAt: Date.now(),
    locked: false,
    maxPlayers: 10,
    phase: "waiting",
    started: false,
    players: [],
    spectators: [],
    profiles: {},
    nightActions: {},
    votes: {},
    history: [],
    startedAt: null,
    statsSaved: false,
    settings: {
      sheriff: true,
      don: true,
      doctor: true,
      mafia: 1,
      detectiveText: true,
      serialKiller: false,
      yakuza: false,
      chogun: false,
      vigilante: false,
      maniac: false
    }
  };
}

function getRoom(code) {
  if (!code) return null;
  return rooms.get(String(code));
}

function cleanName(name) {
  return String(name || "Player").slice(0, 24);
}

function roomList() {
  return [...rooms.values()].map(r => {
    const levels = Object.values(r.profiles).map(p => Number(p.level || 1));
    const avgLevel = levels.length ? Math.round(levels.reduce((a,b)=>a+b,0) / levels.length) : 1;
    const ageMin = Math.max(0, Math.floor((Date.now() - r.createdAt) / 60000));
    return {
      code: r.code,
      hostName: r.hostName || "Unknown",
      playerCount: r.players.length,
      spectatorCount: r.spectators.length,
      maxPlayers: r.maxPlayers,
      phase: r.phase,
      locked: r.locked,
      avgLevel,
      createdAgo: ageMin <= 0 ? "now" : `${ageMin}m ago`
    };
  });
}

function emitRoomList() {
  io.emit("update-room-list", roomList());
}

function publicPlayers(room) {
  return room.players.map((p, i) => ({
    id: p.id,
    name: p.name,
    nick: p.name,
    index: i + 1,
    alive: p.alive,
    avatar: room.profiles[p.id]?.avatar || "🕶️",
    level: room.profiles[p.id]?.level || 1,
    xp: room.profiles[p.id]?.xp || 0,
    games: room.profiles[p.id]?.games || 0,
    wins: room.profiles[p.id]?.wins || 0,
    mvp: room.profiles[p.id]?.mvp || 0
  }));
}

function publicSpectators(room) {
  return room.spectators.map(s => ({
    id: s.id,
    name: s.name,
    nick: s.name,
    avatar: room.profiles[s.id]?.avatar || "🕶️",
    level: room.profiles[s.id]?.level || 1,
    isSpectator: true
  }));
}

function emitState(room) {
  io.to(room.code).emit("game-state", {
    phase: room.phase,
    players: publicPlayers(room),
    spectators: publicSpectators(room),
    profiles: room.profiles,
    locked: room.locked
  });
  io.to(room.code).emit("room-users-list", publicPlayers(room));
  io.to(room.code).emit("spectators-update", publicSpectators(room));
  io.to(room.code).emit("room-profiles", room.profiles);
  emitRoomList();
}

function logRoom(room, text, type = "game") {
  const item = { text, type, at: Date.now() };
  room.history.push(item);
  if (room.history.length > 120) room.history.shift();
  io.to(room.code).emit("game-log", item);
}

function removeSocketFromRooms(socket) {
  for (const [code, room] of rooms.entries()) {
    const beforePlayers = room.players.length;
    const beforeSpecs = room.spectators.length;
    room.players = room.players.filter(p => p.id !== socket.id);
    room.spectators = room.spectators.filter(s => s.id !== socket.id);
    delete room.profiles[socket.id];

    if (beforePlayers !== room.players.length || beforeSpecs !== room.spectators.length) {
      logRoom(room, `${socket.data.nick || "Player"} left the room`, "room");
      if (room.hostId === socket.id) {
        const nextHost = room.players[0];
        if (nextHost) {
          room.hostId = nextHost.id;
          room.hostName = nextHost.name;
          io.to(nextHost.id).emit("is-host");
          logRoom(room, `${nextHost.name} is the new host`, "admin");
        }
      }
      if (!room.players.length && !room.spectators.length) rooms.delete(code);
      else emitState(room);
    }
  }
  emitRoomList();
}

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function assignRoles(room, settings = {}) {
  room.settings = { ...room.settings, ...settings };
  const players = shuffle(room.players);
  const roles = [];

  const mafiaCount = Math.max(1, Math.min(Number(room.settings.mafia || 1), Math.max(1, players.length - 1)));
  if (room.settings.don && players.length >= 5) roles.push("don");
  for (let i = 0; i < mafiaCount; i++) roles.push("mafia");

  if (room.settings.sheriff) roles.push("sheriff");
  if (room.settings.doctor) roles.push("doctor");
  if (room.settings.detectiveText) roles.push("detective");
  if (room.settings.serialKiller) roles.push("serial_killer");
  if (room.settings.yakuza) roles.push("yakuza");
  if (room.settings.chogun) roles.push("chogun");
  if (room.settings.vigilante) roles.push("vigilante");
  if (room.settings.maniac) roles.push("maniac");

  while (roles.length < players.length) roles.push("citizen");
  roles.length = players.length;

  players.forEach((p, i) => {
    p.role = roles[i] || "citizen";
    p.alive = true;
    io.to(p.id).emit("role-assigned", p.role);
  });

  const mafiaIds = room.players.filter(p => ["mafia", "don"].includes(p.role)).map(p => p.id);
  const yakuzaIds = room.players.filter(p => ["yakuza", "chogun"].includes(p.role)).map(p => p.id);
  io.to(room.code).emit("mafia-list", mafiaIds);
  io.to(room.code).emit("yakuza-list", yakuzaIds);
}

function startGame(room, settings) {
  if (room.players.length < 4) {
    io.to(room.hostId).emit("error", { msg: "საჭიროა მინიმუმ 4 მოთამაშე" });
    return;
  }
  room.started = true;
  room.startedAt = new Date();
  room.statsSaved = false;
  room.locked = true;
  room.phase = "role-reveal";
  room.nightActions = {};
  room.votes = {};
  assignRoles(room, settings);
  logRoom(room, "Game started. Roles were assigned.", "start");
  emitState(room);

  setTimeout(() => {
    if (!rooms.has(room.code)) return;
    room.phase = "night";
    room.nightActions = {};
    logRoom(room, "Night phase started", "phase");
    emitState(room);
  }, 8000);
}

function alivePlayers(room) {
  return room.players.filter(p => p.alive);
}

function playerById(room, id) {
  return room.players.find(p => p.id === id);
}

function teamOf(role) {
  if (["mafia", "don"].includes(role)) return "mafia";
  if (["yakuza", "chogun"].includes(role)) return "yakuza";
  if (role === "serial_killer") return "solo";
  return "citizen";
}

function resolveNight(room) {
  const actions = Object.values(room.nightActions);
  const saved = new Set(actions.filter(a => a.action === "save").map(a => a.targetId));
  const kills = actions.filter(a => ["kill", "serial-kill", "yakuza-kill", "vigilante-kill"].includes(a.action));
  const killedNames = [];

  kills.forEach(a => {
    const target = playerById(room, a.targetId);
    if (!target || !target.alive) return;
    if (saved.has(target.id)) {
      logRoom(room, `${target.name} was attacked but saved`, "night");
      return;
    }
    target.alive = false;
    killedNames.push(target.name);
  });

  if (!killedNames.length) logRoom(room, "Night ended. Nobody died.", "night");
  else logRoom(room, `Night deaths: ${killedNames.join(", ")}`, "night");

  room.nightActions = {};
  checkWin(room);
  if (room.phase !== "ended") room.phase = "day";
  emitState(room);
}

function resolveVotes(room) {
  const counts = {};
  for (const targetId of Object.values(room.votes)) {
    counts[targetId] = (counts[targetId] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const readable = {};
  sorted.forEach(([id, count]) => {
    const p = playerById(room, id);
    if (p) readable[p.name] = count;
  });
  io.to(room.code).emit("vote-results", readable);

  if (sorted.length) {
    const [targetId, top] = sorted[0];
    const tie = sorted[1] && sorted[1][1] === top;
    if (!tie) {
      const target = playerById(room, targetId);
      if (target && target.alive) {
        target.alive = false;
        logRoom(room, `${target.name} was voted out`, "vote");
      }
    } else {
      logRoom(room, "Vote tied. Nobody was executed.", "vote");
    }
  } else {
    logRoom(room, "No votes were cast", "vote");
  }

  room.votes = {};
  checkWin(room);
  if (room.phase !== "ended") room.phase = "night";
  emitState(room);
}

function finishGame(room, message) {
  room.phase = "ended";
  const winnerTeam = winningTeamFromMessage(message);
  const mvp = computeMvp(room, winnerTeam);
  io.to(room.code).emit("game-over", { message, winnerTeam, mvp: mvp ? { nickname: mvp.nickname, avatar: mvp.avatar, score: mvp.score } : null });
  persistGameResult(room, message).catch(err => console.error("Persist game result failed:", err.message));
  return true;
}

function checkWin(room) {
  const alive = alivePlayers(room);
  if (!alive.length) return finishGame(room, "თამაში დასრულდა — ყველა მოკვდა.");
  const mafia = alive.filter(p => teamOf(p.role) === "mafia").length;
  const citizens = alive.filter(p => teamOf(p.role) === "citizen").length;
  const solo = alive.filter(p => teamOf(p.role) === "solo").length;
  if (solo === 1 && alive.length === 1) return finishGame(room, "სერიული მკვლელი / solo player wins!");
  if (mafia === 0 && solo === 0) return finishGame(room, "მოქალაქეები გაიმარჯვეს!");
  if (mafia > 0 && mafia >= citizens + solo) return finishGame(room, "მაფია გაიმარჯვებს — Mafia wins!");
  return false;
}
io.on("connection", socket => {
  socket.on("get-rooms", emitRoomList);
  socket.on("ping-check", () => socket.emit("pong-check"));

  socket.on("join-room", async (roomCode, nick, isSpectator = false, profile = {}) => {
    roomCode = String(roomCode || "").trim();
    if (!roomCode) return socket.emit("error", { msg: "ოთახის ID ცარიელია" });

    let room = rooms.get(roomCode);
    const name = cleanName(nick);
    if (!room) {
      room = makeRoom(roomCode, socket.id, name);
      rooms.set(roomCode, room);
    }

    if (room.locked && !isSpectator) {
      return socket.emit("error", { msg: "ოთახი დაკეტილია ან თამაში უკვე დაიწყო" });
    }
    if (!isSpectator && room.players.length >= room.maxPlayers) {
      return socket.emit("error", { msg: "ოთახი სავსეა" });
    }

    socket.join(roomCode);
    socket.data.room = roomCode;
    socket.data.nick = name;
    socket.data.isSpectator = !!isSpectator;

    room.players = room.players.filter(p => p.id !== socket.id);
    room.spectators = room.spectators.filter(s => s.id !== socket.id);

    const dbProfile = await loadOrCreateUserProfile(name, profile.avatar || "🕶️");
    socket.emit("profile-loaded", dbProfile);

    room.profiles[socket.id] = {
      id: socket.id,
      userKey: dbProfile.userKey || userKeyFromName(name),
      name,
      nick: name,
      avatar: dbProfile.avatar || profile.avatar || "🕶️",
      level: levelFromXp(dbProfile.xp || profile.xp || 0),
      xp: Number(dbProfile.xp || profile.xp || 0),
      games: Number(dbProfile.games || profile.games || 0),
      wins: Number(dbProfile.wins || profile.wins || 0),
      losses: Number(dbProfile.losses || 0),
      mvp: Number(dbProfile.mvp || profile.mvp || 0),
      kills: Number(dbProfile.kills || 0),
      saves: Number(dbProfile.saves || 0),
      checks: Number(dbProfile.checks || 0),
      correctVotes: Number(dbProfile.correctVotes || 0),
      isSpectator: !!isSpectator
    };

    if (isSpectator) room.spectators.push({ id: socket.id, name });
    else room.players.push({ id: socket.id, name, alive: true, role: null });

    if (!room.hostId || !room.players.some(p => p.id === room.hostId)) {
      const host = room.players[0];
      if (host) { room.hostId = host.id; room.hostName = host.name; }
    }
    if (room.hostId === socket.id) socket.emit("is-host");

    const existing = publicPlayers(room).filter(p => p.id !== socket.id);
    socket.emit("all-users-info", existing);
    emitState(room);
    logRoom(room, `${name} joined as ${isSpectator ? "spectator" : "player"}`, "room");
  });

  socket.on("sending-signal", payload => {
    if (!payload?.userToSignal) return;
    const room = getRoom(socket.data.room);
    const prof = room?.profiles?.[socket.id] || {};
    io.to(payload.userToSignal).emit("user-joined-with-info", {
      signal: payload.signal,
      id: payload.callerID || socket.id,
      nick: socket.data.nick,
      name: socket.data.nick,
      avatar: prof.avatar,
      level: prof.level,
      index: room ? publicPlayers(room).find(p => p.id === socket.id)?.index : 1
    });
  });

  socket.on("returning-signal", payload => {
    if (!payload?.callerID) return;
    io.to(payload.callerID).emit("receiving-returned-signal", {
      signal: payload.signal,
      id: socket.id
    });
  });

  socket.on("start-game-request", data => {
    const room = getRoom(data?.room || socket.data.room);
    if (!room) return;
    if (room.hostId !== socket.id) return socket.emit("error", { msg: "მხოლოდ ჰოსტს შეუძლია დაწყება" });
    startGame(room, data.settings || {});
  });

  socket.on("night-action", data => {
    const room = getRoom(data?.room || socket.data.room);
    if (!room || room.phase !== "night") return;
    const actor = playerById(room, socket.id);
    const target = playerById(room, data.targetId);
    if (!actor || !target || !actor.alive) return;

    room.nightActions[socket.id] = { actorId: socket.id, targetId: target.id, action: data.action };
    logRoom(room, `${actor.name} submitted night action`, "night");

    if (data.action === "check") {
      const isMafia = teamOf(target.role) === "mafia" && !["don", "yakuza"].includes(target.role);
      socket.emit("sheriff-result", { name: target.name, isMafia });
    }

    const actionable = alivePlayers(room).filter(p => !["citizen"].includes(p.role)).length || 1;
    if (Object.keys(room.nightActions).length >= actionable) resolveNight(room);
  });

  socket.on("vote-player", data => {
    const room = getRoom(data?.room || socket.data.room);
    if (!room || room.phase !== "vote") return;
    const voter = playerById(room, socket.id);
    const target = playerById(room, data.targetId);
    if (!voter || !target || !voter.alive) return;
    room.votes[socket.id] = target.id;
    logRoom(room, `${voter.name} voted`, "vote");

    if (Object.keys(room.votes).length >= alivePlayers(room).length) resolveVotes(room);
  });

  socket.on("send-chat-msg", data => {
    const room = getRoom(data?.room || socket.data.room);
    if (!room) return;
    const tab = data.tab || "main";
    const msg = {
      name: cleanName(data.name || socket.data.nick),
      text: String(data.text || "").slice(0, 400),
      tab
    };

    if (tab === "mafia") {
      const sender = playerById(room, socket.id);
      if (!sender || !["mafia","don","yakuza","chogun"].includes(sender.role)) return;
      room.players
        .filter(p => ["mafia","don","yakuza","chogun"].includes(p.role))
        .forEach(p => io.to(p.id).emit("receive-chat-msg", msg));
      return;
    }

    if (tab === "spectator") {
      room.spectators.forEach(s => io.to(s.id).emit("receive-chat-msg", msg));
      return;
    }

    if (tab === "dead") {
      room.players.filter(p => !p.alive).forEach(p => io.to(p.id).emit("receive-chat-msg", msg));
      return;
    }

    io.to(room.code).emit("receive-chat-msg", msg);
  });

  socket.on("admin-action", data => {
    const room = getRoom(data?.room || socket.data.room);
    if (!room || room.hostId !== socket.id) return;

    switch (data.action) {
      case "end-game":
        finishGame(room, "თამაში დასრულდა ჰოსტის მიერ.");
        break;
      case "reset-game":
        room.phase = "waiting";
        room.started = false;
        room.locked = false;
        room.players.forEach(p => { p.alive = true; p.role = null; });
        break;
      case "force-day":
        room.phase = "day";
        break;
      case "force-vote":
        room.phase = "vote";
        break;
      case "force-night":
        room.phase = "night";
        room.nightActions = {};
        break;
      case "revive-all":
        room.players.forEach(p => p.alive = true);
        break;
      case "kill-random": {
        const a = alivePlayers(room);
        if (a.length) a[Math.floor(Math.random() * a.length)].alive = false;
        checkWin(room);
        break;
      }
      case "lock-room":
        room.locked = true;
        break;
      case "unlock-room":
        room.locked = false;
        break;
      case "close-room":
        io.to(room.code).emit("error", { msg: "ოთახი დაიხურა" });
        io.in(room.code).socketsLeave(room.code);
        rooms.delete(room.code);
        emitRoomList();
        return;
      case "start-individual-turns":
        io.to(room.code).emit("start-individual-turns", data.data || alivePlayers(room).map(p => p.id));
        break;
      case "clear-chat":
        io.to(room.code).emit("phase-message", "Chat cleared by host");
        break;
      default:
        logRoom(room, `Admin action: ${data.action}`, "admin");
    }
    logRoom(room, `Admin action: ${data.action}`, "admin");
    emitState(room);
  });

  socket.on("admin-announcement", data => {
    const room = getRoom(data?.room || socket.data.room);
    if (!room || room.hostId !== socket.id) return;
    io.to(room.code).emit("admin-announcement", { message: String(data.message || "").slice(0, 200) });
  });

  socket.on("disconnect", () => removeSocketFromRooms(socket));
});

connectMongo().finally(() => {
  server.listen(PORT, () => {
    console.log(`VOID MAFIA v8 MongoDB Edition running on port ${PORT}`);
  });
});
