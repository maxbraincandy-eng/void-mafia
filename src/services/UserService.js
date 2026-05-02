const bcrypt = require("bcryptjs");

const memoryUsers = new Map();
let memoryNextId = Number(process.env.USER_ID_START || 1);

function cleanNickname(value) {
  const text = String(value || "Player").trim();
  return text.slice(0, 32) || "Player";
}

function cleanEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanAvatar(value) {
  return String(value || "◆").trim().slice(0, 4) || "◆";
}

function defaultStats() {
  return {
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    mvp: 0,
    xp: 0,
    level: 1
  };
}

function publicUser(user) {
  if (!user) return null;

  const raw = typeof user.toObject === "function" ? user.toObject() : user;

  return {
    userId: Number(raw.userId),
    nickname: raw.nickname || raw.username || "Player",
    username: raw.username || raw.nickname || "Player",
    email: raw.email || "",
    avatar: raw.avatar || "◆",
    provider: raw.provider || "guest",
    clanId: raw.clanId || "",
    role: raw.role || "user",

    stats: raw.stats || defaultStats(),

    roleStats: Array.isArray(raw.roleStats) ? raw.roleStats : [],
    matchHistory: Array.isArray(raw.matchHistory) ? raw.matchHistory.slice(0, 50) : [],

    isAdmin: !!raw.isAdmin,
    isMonitor: !!raw.isMonitor,

    createdAt: raw.createdAt || null,
    lastLoginAt: raw.lastLoginAt || raw.lastSeen || null
  };
}

async function getNextUserId(ctx) {
  if (!ctx?.db?.enabled || !ctx.db.models?.Counter) {
    return memoryNextId++;
  }

  const Counter = ctx.db.models.Counter;
  const start = Number(process.env.USER_ID_START || 1);

  const counter = await Counter.findOneAndUpdate(
    { key: "userId" },
    {
      $setOnInsert: { value: start - 1 },
      $inc: { value: 1 }
    },
    {
      new: true,
      upsert: true
    }
  );

  return counter.value;
}

function findMemoryUserByEmail(email) {
  for (const user of memoryUsers.values()) {
    if (email && user.email === email) return user;
  }

  return null;
}

function findMemoryUserByProvider(provider, providerId) {
  for (const user of memoryUsers.values()) {
    if (user.provider === provider && user.providerId === providerId) return user;
  }

  return null;
}

async function getOrCreateUser(ctx, payload = {}) {
  const nickname = cleanNickname(payload.nickname || payload.name || payload.username);
  const email = cleanEmail(payload.email);
  const avatar = cleanAvatar(payload.avatar);
  const provider = payload.provider || (email ? "email" : "guest");
  const providerId = String(payload.providerId || "");

  const adminIds = ctx?.security?.adminIds || [];
  const monitorIds = ctx?.security?.monitorIds || [];

  if (ctx?.db?.enabled && ctx.db.models?.User) {
    const User = ctx.db.models.User;

    let user = null;

    if (email) {
      user = await User.findOne({ email });
    }

    if (!user && providerId) {
      user = await User.findOne({ provider, providerId });
    }

    if (!user && payload.userId) {
      user = await User.findOne({ userId: Number(payload.userId) });
    }

    if (!user) {
      const userId = await getNextUserId(ctx);

      const createPayload = {
        userId,
        nickname,
        username: nickname,
        email,
        avatar,
        provider,
        providerId,
        stats: defaultStats(),
        roleStats: [],
        matchHistory: [],
        isAdmin: adminIds.includes(String(userId)),
        isMonitor: monitorIds.includes(String(userId)),
        lastLoginAt: new Date()
      };

      if (payload.password) {
        createPayload.passwordHash = await bcrypt.hash(String(payload.password), 10);
      }

      user = await User.create(createPayload);
    } else {
      user.nickname = nickname || user.nickname;
      user.username = nickname || user.username || user.nickname;
      user.avatar = avatar || user.avatar;
      user.lastLoginAt = new Date();

      if (email && !user.email) user.email = email;
      if (provider && !user.provider) user.provider = provider;
      if (providerId && !user.providerId) user.providerId = providerId;

      if (payload.password && !user.passwordHash) {
        user.passwordHash = await bcrypt.hash(String(payload.password), 10);
      }

      user.isAdmin = adminIds.includes(String(user.userId)) || !!user.isAdmin;
      user.isMonitor = monitorIds.includes(String(user.userId)) || !!user.isMonitor;

      if (!user.stats) user.stats = defaultStats();

      await user.save();
    }

    return publicUser(user);
  }

  let user = null;

  if (email) {
    user = findMemoryUserByEmail(email);
  }

  if (!user && providerId) {
    user = findMemoryUserByProvider(provider, providerId);
  }

  if (!user && payload.userId) {
    user = memoryUsers.get(Number(payload.userId));
  }

  if (!user) {
    const userId = memoryNextId++;

    user = {
      userId,
      nickname,
      username: nickname,
      email,
      avatar,
      provider,
      providerId,
      clanId: "",
      stats: defaultStats(),
      roleStats: [],
      matchHistory: [],
      isAdmin: adminIds.includes(String(userId)),
      isMonitor: monitorIds.includes(String(userId)),
      createdAt: new Date(),
      lastLoginAt: new Date()
    };

    memoryUsers.set(userId, user);
  } else {
    user.nickname = nickname || user.nickname;
    user.username = nickname || user.username || user.nickname;
    user.avatar = avatar || user.avatar;
    user.lastLoginAt = new Date();

    if (!user.stats) user.stats = defaultStats();
  }

  return publicUser(user);
}

async function getUserProfile(ctx, userId) {
  const numericId = Number(userId);

  if (!Number.isFinite(numericId)) return null;

  if (ctx?.db?.enabled && ctx.db.models?.User) {
    const user = await ctx.db.models.User.findOne({ userId: numericId }).lean();

    if (!user) return null;

    return publicUser(user);
  }

  const user = memoryUsers.get(numericId);
  return publicUser(user);
}

async function updateUserProfile(ctx, userId, patch = {}) {
  const numericId = Number(userId);

  if (!Number.isFinite(numericId)) return null;

  const nickname = String(patch.nickname || patch.username || "").trim().slice(0, 32);
  const avatar = String(patch.avatar || "").trim().slice(0, 4);

  if (ctx?.db?.enabled && ctx.db.models?.User) {
    const update = {
      lastLoginAt: new Date()
    };

    if (nickname) {
      update.nickname = nickname;
      update.username = nickname;
    }

    if (avatar) {
      update.avatar = avatar;
    }

    const user = await ctx.db.models.User.findOneAndUpdate(
      { userId: numericId },
      { $set: update },
      { new: true }
    ).lean();

    if (!user) return null;

    return publicUser(user);
  }

  const user = memoryUsers.get(numericId);

  if (!user) return null;

  if (nickname) {
    user.nickname = nickname;
    user.username = nickname;
  }

  if (avatar) {
    user.avatar = avatar;
  }

  user.lastLoginAt = new Date();

  return publicUser(user);
}

async function registerGameResult(ctx, userId, result = {}) {
  const numericId = Number(userId);

  if (!Number.isFinite(numericId)) return null;

  const win = result.result === "win";
  const loss = result.result === "loss";
  const draw = result.result === "draw";
  const role = result.role || "citizen";

  if (ctx?.db?.enabled && ctx.db.models?.User) {
    const User = ctx.db.models.User;

    const user = await User.findOne({ userId: numericId });
    if (!user) return null;

    if (!user.stats) user.stats = defaultStats();
    if (!Array.isArray(user.roleStats)) user.roleStats = [];
    if (!Array.isArray(user.matchHistory)) user.matchHistory = [];

    user.stats.gamesPlayed += 1;
    if (win) user.stats.wins += 1;
    if (loss) user.stats.losses += 1;
    if (draw) user.stats.draws += 1;

    user.stats.xp += win ? 25 : 8;
    user.stats.level = Math.max(1, Math.floor(user.stats.xp / 100) + 1);

    let roleStat = user.roleStats.find(r => r.role === role);

    if (!roleStat) {
      roleStat = {
        role,
        played: 0,
        wins: 0,
        losses: 0
      };

      user.roleStats.push(roleStat);
    }

    roleStat.played += 1;
    if (win) roleStat.wins += 1;
    if (loss) roleStat.losses += 1;

    user.matchHistory.unshift({
      roomId: result.roomId || "",
      roomName: result.roomName || "",
      role,
      result: result.result || "unknown",
      survived: !!result.survived,
      playedAt: new Date()
    });

    user.matchHistory = user.matchHistory.slice(0, 50);

    await user.save();

    return publicUser(user);
  }

  const user = memoryUsers.get(numericId);

  if (!user) return null;

  if (!user.stats) user.stats = defaultStats();
  if (!Array.isArray(user.matchHistory)) user.matchHistory = [];

  user.stats.gamesPlayed += 1;
  if (win) user.stats.wins += 1;
  if (loss) user.stats.losses += 1;
  if (draw) user.stats.draws += 1;

  user.stats.xp += win ? 25 : 8;
  user.stats.level = Math.max(1, Math.floor(user.stats.xp / 100) + 1);

  user.matchHistory.unshift({
    roomId: result.roomId || "",
    roomName: result.roomName || "",
    role,
    result: result.result || "unknown",
    survived: !!result.survived,
    playedAt: new Date()
  });

  user.matchHistory = user.matchHistory.slice(0, 50);

  return publicUser(user);
}

async function leaderboard(ctx, limit = 100) {
  const safeLimit = Math.min(Number(limit) || 100, 100);

  if (ctx?.db?.enabled && ctx.db.models?.User) {
    const users = await ctx.db.models.User
      .find({})
      .sort({
        "stats.xp": -1,
        "stats.wins": -1,
        "stats.gamesPlayed": -1,
        createdAt: 1
      })
      .limit(safeLimit)
      .lean();

    return users.map(publicUser);
  }

  return Array.from(memoryUsers.values())
    .sort((a, b) => {
      const axp = a.stats?.xp || 0;
      const bxp = b.stats?.xp || 0;

      const awins = a.stats?.wins || 0;
      const bwins = b.stats?.wins || 0;

      return bxp - axp || bwins - awins;
    })
    .slice(0, safeLimit)
    .map(publicUser);
}

module.exports = {
  getOrCreateUser,
  getUserProfile,
  updateUserProfile,
  registerGameResult,
  leaderboard,
  publicUser
};
