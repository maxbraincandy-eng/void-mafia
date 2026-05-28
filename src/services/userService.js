const bcrypt = require('bcryptjs');
const { DEFAULT_STATS } = require('../db');

const memoryUsers = new Map();
let memoryNextId = Number(process.env.USER_ID_START || 1);

function cleanNickname(v) { return String(v || 'Player').trim().slice(0, 32) || 'Player'; }
function cleanEmail(v) { return String(v || '').trim().toLowerCase(); }
function cleanAvatar(v) { return String(v || '◆').trim().slice(0, 4) || '◆'; }
function levelFromXp(xp) { return Math.max(1, Math.floor(Number(xp || 0) / 100) + 1); }
function rankFromLevel(level) {
  if (level >= 50) return 'Godfather';
  if (level >= 35) return 'Boss';
  if (level >= 20) return 'Underboss';
  if (level >= 10) return 'Soldier';
  if (level >= 4) return 'Associate';
  return 'Newbie';
}
function normalizeStats(stats = {}) { return { ...DEFAULT_STATS, ...stats }; }
function publicUser(user) {
  if (!user) return null;
  const raw = typeof user.toObject === 'function' ? user.toObject() : user;
  const stats = normalizeStats(raw.stats);
  const level = levelFromXp(stats.xp);
  return {
    userId: Number(raw.userId),
    nickname: raw.nickname || 'Player',
    email: raw.email || '',
    avatar: raw.avatar || '◆',
    country: raw.country || 'Georgia',
    language: raw.language || 'Georgian',
    rank: rankFromLevel(level),
    level,
    coins: Number(raw.coins ?? 50),
    energy: Number(raw.energy ?? 20),
    crystals: Number(raw.crystals ?? 0),
    clanId: raw.clanId || '',
    ownedRoles: raw.ownedRoles || ['citizen', 'mafia', 'doctor', 'sheriff'],
    ownedItems: raw.ownedItems || [],
    stats,
    roleStats: raw.roleStats || [],
    matchHistory: raw.matchHistory || [],
    settings: raw.settings || {},
    isAdmin: !!raw.isAdmin,
    isMonitor: !!raw.isMonitor,
    isBanned: !!raw.isBanned,
    createdAt: raw.createdAt || null,
    lastLoginAt: raw.lastLoginAt || null
  };
}
async function nextUserId(ctx) {
  if (ctx.db.enabled && ctx.db.models.Counter) {
    const start = Number(process.env.USER_ID_START || 1);
    const c = await ctx.db.models.Counter.findOneAndUpdate({ key: 'userId' }, { $setOnInsert: { value: start - 1 }, $inc: { value: 1 } }, { new: true, upsert: true });
    return c.value;
  }
  return memoryNextId++;
}
function adminFlag(ctx, userId) { return (ctx.security.adminIds || []).includes(String(userId)); }
function monitorFlag(ctx, userId) { return (ctx.security.monitorIds || []).includes(String(userId)); }
async function createUser(ctx, payload = {}) {
  const userId = await nextUserId(ctx);
  const doc = {
    userId,
    nickname: cleanNickname(payload.nickname || payload.name),
    email: cleanEmail(payload.email),
    avatar: cleanAvatar(payload.avatar),
    passwordHash: payload.password ? await bcrypt.hash(String(payload.password), 10) : '',
    isAdmin: adminFlag(ctx, userId),
    isMonitor: monitorFlag(ctx, userId),
    stats: { ...DEFAULT_STATS },
    lastLoginAt: new Date()
  };
  if (ctx.db.enabled) return publicUser(await ctx.db.models.User.create(doc));
  memoryUsers.set(userId, doc);
  return publicUser(doc);
}
async function register(ctx, payload) {
  const email = cleanEmail(payload.email);
  if (!email || !payload.password) throw Error('Email and password required');
  if (ctx.db.enabled) {
    const exists = await ctx.db.models.User.findOne({ email });
    if (exists) throw Error('Email already registered');
  } else {
    for (const u of memoryUsers.values()) if (u.email === email) throw Error('Email already registered');
  }
  return createUser(ctx, payload);
}
async function login(ctx, email, password) {
  email = cleanEmail(email);
  let user;
  if (ctx.db.enabled) user = await ctx.db.models.User.findOne({ email });
  else for (const u of memoryUsers.values()) if (u.email === email) user = u;
  if (!user || !user.passwordHash) throw Error('Invalid login');
  const ok = await bcrypt.compare(String(password || ''), user.passwordHash);
  if (!ok) throw Error('Invalid login');
  user.lastLoginAt = new Date();
  if (user.save) await user.save();
  return publicUser(user);
}
async function getOrCreateGuest(ctx, payload = {}) {
  if (payload.userId) {
    const found = await findUserById(ctx, payload.userId);
    if (found) return found;
  }
  return createUser(ctx, { nickname: payload.nickname || 'Guest', avatar: payload.avatar || '◆' });
}
async function findUserById(ctx, userId) {
  const id = Number(userId);
  if (!id) return null;
  if (ctx.db.enabled) return publicUser(await ctx.db.models.User.findOne({ userId: id }));
  return publicUser(memoryUsers.get(id));
}
async function updateProfile(ctx, userId, patch = {}) {
  const id = Number(userId);
  const fields = {
    nickname: cleanNickname(patch.nickname),
    avatar: cleanAvatar(patch.avatar),
    country: String(patch.country || 'Georgia').slice(0, 40),
    language: String(patch.language || 'Georgian').slice(0, 40)
  };
  if (ctx.db.enabled) {
    const u = await ctx.db.models.User.findOneAndUpdate({ userId: id }, { $set: fields }, { new: true });
    return publicUser(u);
  }
  const u = memoryUsers.get(id); if (!u) return null; Object.assign(u, fields); return publicUser(u);
}
async function leaderboard(ctx, limit = 100) {
  if (ctx.db.enabled) {
    const users = await ctx.db.models.User.find({ isBanned: false }).limit(limit).lean();
    return users.map(publicUser).sort((a, b) => (b.stats.xp - a.stats.xp) || (b.stats.wins - a.stats.wins)).slice(0, limit);
  }
  return [...memoryUsers.values()].map(publicUser).sort((a, b) => b.stats.xp - a.stats.xp).slice(0, limit);
}
async function applyGameResult(ctx, player, result) {
  const u = await findRaw(ctx, player.userId); if (!u) return;
  const s = normalizeStats(u.stats);
  s.games += 1;
  if (result.win) { s.wins += 1; s.streak += 1; s.bestStreak = Math.max(s.bestStreak, s.streak); s.xp += 30; }
  else { s.losses += 1; s.streak = 0; s.xp += 8; }
  if (result.survived) s.survived += 1;
  if (player.team === 'mafia') s.mafiaGames += 1; else s.citizenGames += 1;
  u.stats = s;
  u.matchHistory = [{ roomId: result.roomId, roomName: result.roomName, role: player.role, result: result.win ? 'win' : 'loss', survived: result.survived, playedAt: new Date() }, ...(u.matchHistory || [])].slice(0, 50);
  if (u.save) await u.save();
}
async function findRaw(ctx, userId) {
  const id = Number(userId);
  if (ctx.db.enabled) return ctx.db.models.User.findOne({ userId: id });
  return memoryUsers.get(id);
}
module.exports = { register, login, getOrCreateGuest, findUserById, updateProfile, leaderboard, applyGameResult, publicUser, rankFromLevel, levelFromXp };
