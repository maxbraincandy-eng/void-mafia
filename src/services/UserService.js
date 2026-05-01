let UserModel = null;
let CounterModel = null;
let initialized = false;

function initModels(ctx) {
  if (initialized || !ctx.db.enabled) return;
  const mongoose = ctx.db.mongoose;

  const counterSchema = new mongoose.Schema({
    key: { type: String, unique: true },
    seq: { type: Number, default: Number(process.env.USER_ID_START || 1) - 1 }
  });

  const userSchema = new mongoose.Schema({
    userId: { type: Number, unique: true, index: true },
    nickname: { type: String, default: "" },
    email: { type: String, unique: true, sparse: true, index: true },
    passwordHash: { type: String, default: "" },
    googleId: { type: String, unique: true, sparse: true, index: true },
    facebookId: { type: String, unique: true, sparse: true, index: true },
    avatar: { type: String, default: "◆" },
    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    games: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    mvp: { type: Number, default: 0 },
    clanId: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    lastSeen: { type: Date, default: Date.now }
  });

  CounterModel = mongoose.models.Counter || mongoose.model("Counter", counterSchema);
  UserModel = mongoose.models.User || mongoose.model("User", userSchema);
  initialized = true;
}

async function nextUserId(ctx) {
  initModels(ctx);
  if (!CounterModel) return null;
  const c = await CounterModel.findOneAndUpdate(
    { key: "userId" },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return c.seq;
}

async function getOrCreateUser(ctx, input = {}) {
  initModels(ctx);

  if (!UserModel) return ctx.store.getOrCreateUser(input);

  if (input.userId) {
    const found = await UserModel.findOne({ userId: Number(input.userId) });
    if (found) {
      if (input.nickname) found.nickname = input.nickname;
      if (input.avatar) found.avatar = input.avatar;
      found.lastSeen = new Date();
      await found.save();
      return found.toObject();
    }
  }

  const created = await UserModel.create({
    userId: await nextUserId(ctx),
    nickname: input.nickname || "Player",
    avatar: input.avatar || "◆",
    email: input.email || undefined,
    passwordHash: input.passwordHash || ""
  });

  return created.toObject();
}

async function leaderboard(ctx) {
  initModels(ctx);
  if (!UserModel) return ctx.store.leaderboard();
  return UserModel.find().sort({ xp: -1 }).limit(100).lean();
}

module.exports = { initModels, getOrCreateUser, leaderboard };
