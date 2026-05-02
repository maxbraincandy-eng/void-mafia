const express = require("express");
const { publicRoom } = require("../engine/Serializer");
const { getOrCreateUser, leaderboard } = require("../services/UserService");
const { safeText } = require("../utils/text");

function clanToPublic(clan) {
  if (!clan) return null;

  return {
    id: clan.clanId || clan.id,
    clanId: clan.clanId || clan.id,
    name: clan.name || "Clan",
    emblem: clan.emblem || clan.members?.[0]?.avatar || "◆",
    leaderUserId: clan.ownerUserId || clan.leaderUserId,
    leaderName: clan.leaderName || clan.members?.[0]?.nickname || "Leader",
    members: clan.members || [],
    membersCount: Array.isArray(clan.members) ? clan.members.length : 0,
    points: clan.points || 0,
    wins: clan.wins || 0,
    losses: clan.losses || 0,
    createdAt: clan.createdAt || null
  };
}

async function getClans(ctx) {
  if (ctx.db?.enabled && ctx.db.models?.Clan) {
    const clans = await ctx.db.models.Clan
      .find({})
      .sort({ points: -1, createdAt: -1 })
      .limit(100)
      .lean();

    return clans.map(clanToPublic);
  }

  return ctx.store.clansList().map(clanToPublic);
}

async function createClan(ctx, { name, owner }) {
  if (ctx.db?.enabled && ctx.db.models?.Clan) {
    const Clan = ctx.db.models.Clan;
    const User = ctx.db.models.User;

    const clanId = `clan_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    const clan = await Clan.create({
      clanId,
      name,
      emblem: owner.avatar || "◆",
      ownerUserId: Number(owner.userId),
      leaderName: owner.nickname || "Player",
      members: [
        {
          userId: Number(owner.userId),
          nickname: owner.nickname || "Player",
          avatar: owner.avatar || "◆",
          role: "owner",
          joinedAt: new Date()
        }
      ],
      points: 0,
      wins: 0,
      losses: 0
    });

    if (User) {
      await User.updateOne(
        { userId: Number(owner.userId) },
        { $set: { clanId } }
      );
    }

    return clanToPublic(clan.toObject());
  }

  return clanToPublic(
    ctx.store.createClan({
      name,
      owner
    })
  );
}

function createApiRouter(ctx) {
  const router = express.Router();

  router.get("/health", (req, res) => {
    res.json({
      ok: true,
      version: "12.0.0",
      db: !!ctx.db?.enabled,
      mongodb: ctx.db?.enabled ? "connected" : "disabled",
      rooms: ctx.store.roomsList().length,
      metrics: ctx.metrics.snapshot()
    });
  });

  router.get("/rooms", (req, res) => {
    try {
      res.json({
        ok: true,
        rooms: ctx.store.roomsList().map(publicRoom)
      });
    } catch (err) {
      console.error("GET /api/rooms failed:", err);

      res.status(500).json({
        ok: false,
        error: "Rooms load failed"
      });
    }
  });

  router.get("/leaderboard", async (req, res) => {
    try {
      let users = [];

      if (typeof leaderboard === "function") {
        users = await leaderboard(ctx);
      } else if (typeof ctx.store.leaderboard === "function") {
        users = ctx.store.leaderboard();
      }

      res.json({
        ok: true,
        users
      });
    } catch (err) {
      console.error("GET /api/leaderboard failed:", err);

      res.status(500).json({
        ok: false,
        error: "Leaderboard load failed"
      });
    }
  });

  router.get("/clans", async (req, res) => {
    try {
      const clans = await getClans(ctx);

      res.json({
        ok: true,
        clans
      });
    } catch (err) {
      console.error("GET /api/clans failed:", err);

      res.status(500).json({
        ok: false,
        error: "Clans load failed"
      });
    }
  });

  router.post("/clans", async (req, res) => {
    try {
      const body = req.body || {};
      const userInput = body.user || {};

      const name = safeText(body.name, 32);

      if (!name) {
        return res.status(400).json({
          ok: false,
          error: "კლანის სახელი აუცილებელია"
        });
      }

      const owner = await getOrCreateUser(ctx, {
        userId: userInput.userId || undefined,
        nickname: userInput.nickname || "Player",
        email: userInput.email || "",
        avatar: userInput.avatar || "◆",
        provider: userInput.provider || "guest"
      });

      const clan = await createClan(ctx, {
        name,
        owner
      });

      res.json({
        ok: true,
        clan
      });
    } catch (err) {
      console.error("POST /api/clans failed:", err);

      res.status(500).json({
        ok: false,
        error: "კლანის შექმნა ვერ მოხერხდა"
      });
    }
  });

  return router;
}

module.exports = { createApiRouter };
