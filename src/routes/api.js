const express = require("express");
const { publicRoom } = require("../engine/Serializer");
const { leaderboard } = require("../services/UserService");
const { safeText } = require("../utils/text");

function createApiRouter(ctx) {
  const router = express.Router();

  router.get("/health", (req, res) => {
    res.json({
      ok: true,
      version: "12.0.0",
      db: !!ctx.db?.enabled,
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
      const users = await leaderboard(ctx);
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

  router.get("/clans", (req, res) => {
    try {
      res.json({
        ok: true,
        clans: ctx.store.clansList()
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

      const owner = await ctx.store.getOrCreateUser({
        userId: userInput.userId || undefined,
        nickname: userInput.nickname || "Player",
        avatar: userInput.avatar || "◆",
        level: userInput.level || 1,
        xp: userInput.xp || 0
      });

      const name = safeText(body.name, 32);

      if (!name) {
        return res.status(400).json({
          ok: false,
          error: "კლანის სახელი აუცილებელია"
        });
      }

      const clan = ctx.store.createClan({
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
