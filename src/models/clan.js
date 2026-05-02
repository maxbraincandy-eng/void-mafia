const mongoose = require("mongoose");

const ClanMemberSchema = new mongoose.Schema(
  {
    userId: { type: Number, required: true },
    nickname: { type: String, default: "Player" },
    avatar: { type: String, default: "◆" },
    role: {
      type: String,
      enum: ["owner", "admin", "member"],
      default: "member"
    },
    joinedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const ClanSchema = new mongoose.Schema(
  {
    clanId: {
      type: String,
      unique: true,
      index: true,
      required: true
    },

    name: {
      type: String,
      required: true,
      trim: true
    },

    emblem: {
      type: String,
      default: "◆"
    },

    ownerUserId: {
      type: Number,
      required: true,
      index: true
    },

    leaderName: {
      type: String,
      default: "Player"
    },

    members: {
      type: [ClanMemberSchema],
      default: []
    },

    points: {
      type: Number,
      default: 0
    },

    wins: {
      type: Number,
      default: 0
    },

    losses: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.models.Clan || mongoose.model("Clan", ClanSchema);
