const mongoose = require('mongoose');

const DEFAULT_STATS = {
  games: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  xp: 0,
  rating: 5,
  hostedGames: 0,
  mvp: 0,
  survived: 0,
  mafiaGames: 0,
  citizenGames: 0,
  correctVotes: 0,
  totalVotes: 0,
  streak: 0,
  bestStreak: 0
};

const userSchema = new mongoose.Schema({
  userId: { type: Number, unique: true, index: true },
  nickname: { type: String, default: 'Player' },
  email: { type: String, lowercase: true, trim: true, index: true, sparse: true },
  passwordHash: { type: String, default: '' },
  avatar: { type: String, default: '◆' },
  country: { type: String, default: 'Georgia' },
  language: { type: String, default: 'Georgian' },
  rank: { type: String, default: 'Newbie' },
  coins: { type: Number, default: 50 },
  energy: { type: Number, default: 20 },
  crystals: { type: Number, default: 0 },
  clanId: { type: String, default: '' },
  ownedRoles: { type: [String], default: ['citizen', 'mafia', 'doctor', 'sheriff'] },
  ownedItems: { type: [String], default: [] },
  stats: { type: Object, default: () => ({ ...DEFAULT_STATS }) },
  roleStats: { type: Array, default: [] },
  matchHistory: { type: Array, default: [] },
  settings: { type: Object, default: () => ({ allowMessages: true, allowInvites: true, seekingRoom: false }) },
  isAdmin: { type: Boolean, default: false },
  isMonitor: { type: Boolean, default: false },
  isBanned: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date, default: Date.now }
}, { minimize: false });

const clanSchema = new mongoose.Schema({
  clanId: { type: String, unique: true, index: true },
  name: { type: String, required: true },
  tag: { type: String, default: '' },
  emblem: { type: String, default: '◆' },
  ownerUserId: Number,
  members: { type: Array, default: [] },
  level: { type: Number, default: 1 },
  power: { type: Number, default: 0 },
  trophies: { type: Object, default: () => ({ gold: 0, silver: 0, bronze: 0 }) },
  seasonPoints: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
}, { minimize: false });

const counterSchema = new mongoose.Schema({ key: { type: String, unique: true }, value: Number });
const gameSchema = new mongoose.Schema({ gameId: String, roomId: String, roomName: String, players: Array, events: Array, winnerTeam: String, startedAt: Date, endedAt: Date, settings: Object }, { minimize: false });
const reportSchema = new mongoose.Schema({ reporterUserId: Number, targetUserId: Number, roomId: String, reason: String, createdAt: { type: Date, default: Date.now } });

async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return { enabled: false, models: {} };
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 12000 });
    return {
      enabled: true,
      mongoose,
      models: {
        User: mongoose.model('User', userSchema),
        Clan: mongoose.model('Clan', clanSchema),
        Counter: mongoose.model('Counter', counterSchema),
        Game: mongoose.model('Game', gameSchema),
        Report: mongoose.model('Report', reportSchema)
      }
    };
  } catch (err) {
    console.error('MongoDB connection failed, memory fallback enabled:', err.message);
    return { enabled: false, models: {} };
  }
}

module.exports = { connectDatabase, DEFAULT_STATS };
