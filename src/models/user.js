const mongoose = require("mongoose");

const MatchHistorySchema = new mongoose.Schema(
  {
    roomId: { type: String, default: "" },
    roomName: { type: String, default: "" },
    role: { type: String, default: "citizen" },
    result: { type: String, enum: ["win", "loss", "draw", "unknown"], default: "unknown" },
    survived: { type: Boolean, default: false },
    playedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const RoleStatSchema = new mongoose.Schema(
  {
    role: { type: String, default: "citizen" },
    played: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 }
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    userId: {
      type: Number,
      unique: true,
      index: true,
      required: true
    },

    nickname: {
      type: String,
      default: "Player",
      trim: true
    },

    email: {
      type: String,
      default: "",
      lowercase: true,
      trim: true,
      index: true
    },

    passwordHash: {
      type: String,
      default: ""
    },

    avatar: {
      type: String,
      default: "◆"
    },

    provider: {
      type: String,
      enum: ["guest", "email", "google", "facebook"],
      default: "guest"
    },

    providerId: {
      type: String,
      default: ""
    },

    clanId: {
      type: String,
      default: ""
    },

    stats: {
      gamesPlayed: { type: Number, default: 0 },
      wins: { type: Number, default: 0 },
      losses: { type: Number, default: 0 },
      draws: { type: Number, default: 0 },
      mvp: { type: Number, default: 0 },
      xp: { type: Number, default: 0 },
      level: { type: Number, default: 1 }
    },

    roleStats: {
      type: [RoleStatSchema],
      default: []
    },

    matchHistory: {
      type: [MatchHistorySchema],
      default: []
    },

    isAdmin: {
      type: Boolean,
      default: false
    },

    isMonitor: {
      type: Boolean,
      default: false
    },

    lastLoginAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

UserSchema.index({ email: 1 }, { sparse: true });
UserSchema.index({ provider: 1, providerId: 1 });

module.exports = mongoose.models.User || mongoose.model("User", UserSchema);
