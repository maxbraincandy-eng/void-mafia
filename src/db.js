const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const CounterSchema = new mongoose.Schema({
  key: { type: String, unique: true, index: true },
  value: { type: Number, default: 0 }
});

const StatsSchema = {
  gamesPlayed: { type: Number, default: 0 },
  wins: { type: Number, default: 0 },
  losses: { type: Number, default: 0 },
  draws: { type: Number, default: 0 },
  mvp: { type: Number, default: 0 },
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 }
};

const UserSchema = new mongoose.Schema({
  userId: { type: Number, unique: true, index: true },
  nickname: { type: String, default: "Player", index: true },
  email: { type: String, default: "", index: true },
  passwordHash: { type: String, default: "" },
  avatar: { type: String, default: "◆" },
  clanId: { type: String, default: "" },
  provider: { type: String, default: "guest" },
  stats: StatsSchema,
  matchHistory: [{
    roomId: String,
    roomName: String,
    role: String,
    result: String,
    survived: Boolean,
    playedAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date, default: Date.now }
});

const ClanSchema = new mongoose.Schema({
  clanId: { type: String, unique: true, index: true },
  name: { type: String, index: true },
  emblem: { type: String, default: "◆" },
  leaderUserId: Number,
  leaderName: String,
  members: [{ type: Number }],
  points: { type: Number, default: 0 },
  wins: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

async function connectDatabase() {
  const db = { enabled: false, models: {} };
  if (!process.env.MONGODB_URI) return db;

  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    db.enabled = true;
    db.models.Counter = mongoose.models.Counter || mongoose.model("Counter", CounterSchema);
    db.models.User = mongoose.models.User || mongoose.model("User", UserSchema);
    db.models.Clan = mongoose.models.Clan || mongoose.model("Clan", ClanSchema);
    console.log("MongoDB connected");
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
  }

  return db;
}

async function nextUserId(db) {
  const start = Number(process.env.USER_ID_START || 1);
  if (!db.enabled) return start;
  const counter = await db.models.Counter.findOneAndUpdate(
    { key: "userId" },
    { $setOnInsert: { value: start - 1 }, $inc: { value: 1 } },
    { new: true, upsert: true }
  );
  return counter.value;
}

function cleanText(value, max = 240) {
  return String(value || "").trim().slice(0, max);
}

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function publicUser(user) {
  if (!user) return null;
  const u = typeof user.toObject === "function" ? user.toObject() : user;
  return {
    userId: Number(u.userId),
    nickname: u.nickname || "Player",
    email: u.email || "",
    avatar: u.avatar || "◆",
    clanId: u.clanId || "",
    stats: u.stats || { gamesPlayed: 0, wins: 0, losses: 0, draws: 0, mvp: 0, xp: 0, level: 1 },
    matchHistory: Array.isArray(u.matchHistory) ? u.matchHistory.slice(0, 50) : [],
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt
  };
}

async function createGuestUser(db, payload = {}) {
  if (!db.enabled) {
    return { userId: Date.now(), nickname: cleanText(payload.nickname || "Player", 32), avatar: cleanText(payload.avatar || "◆", 4), clanId: "", stats: { level: 1, xp: 0, wins: 0, gamesPlayed: 0 } };
  }
  const userId = await nextUserId(db);
  const user = await db.models.User.create({
    userId,
    nickname: cleanText(payload.nickname || `Player${userId}`, 32),
    avatar: cleanText(payload.avatar || "◆", 4),
    provider: "guest",
    lastLoginAt: new Date()
  });
  return publicUser(user);
}

async function registerUser(db, payload = {}) {
  if (!db.enabled) throw new Error("MongoDB აუცილებელია რეგისტრაციისთვის");
  const email = cleanEmail(payload.email);
  const password = String(payload.password || "");
  const nickname = cleanText(payload.nickname || "Player", 32);
  if (!email || !email.includes("@")) throw new Error("Email არასწორია");
  if (password.length < 4) throw new Error("Password მინიმუმ 4 სიმბოლო უნდა იყოს");
  if (await db.models.User.findOne({ email })) throw new Error("ეს Email უკვე რეგისტრირებულია");
  const userId = await nextUserId(db);
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await db.models.User.create({ userId, email, nickname, passwordHash, provider: "email", lastLoginAt: new Date() });
  return publicUser(user);
}

async function loginUser(db, payload = {}) {
  if (!db.enabled) throw new Error("MongoDB აუცილებელია ავტორიზაციისთვის");
  const user = await db.models.User.findOne({ email: cleanEmail(payload.email) });
  if (!user) throw new Error("მომხმარებელი ვერ მოიძებნა");
  if (!(await bcrypt.compare(String(payload.password || ""), user.passwordHash || ""))) throw new Error("Password არასწორია");
  user.lastLoginAt = new Date();
  await user.save();
  return publicUser(user);
}

async function getProfile(db, userId) {
  if (!db.enabled) return null;
  return publicUser(await db.models.User.findOne({ userId: Number(userId) }).lean());
}

async function updateProfile(db, userId, patch = {}) {
  if (!db.enabled) return null;
  const update = { lastLoginAt: new Date() };
  if (patch.nickname) update.nickname = cleanText(patch.nickname, 32);
  if (patch.avatar) update.avatar = cleanText(patch.avatar, 4);
  return publicUser(await db.models.User.findOneAndUpdate({ userId: Number(userId) }, { $set: update }, { new: true }).lean());
}

module.exports = { connectDatabase, publicUser, createGuestUser, registerUser, loginUser, getProfile, updateProfile, cleanText };
