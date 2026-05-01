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
      db: ctx.db.enabled,
      rooms: ctx.store.roomsList().length,
      metrics: ctx.metrics.snapshot()
    });
  });

  router.get("/rooms", (req, res) => {
    res.json({ ok: true, rooms: ctx.store.roomsList().map(publicRoom) });
  });

  router.get("/leaderboard", async (req, res) => {
    res.json({ ok: true, users: await leaderboard(ctx) });
  });

  router.get("/clans", (req, res) => {
    res.json({ ok: true, clans: ctx.store.clansList() });
  });

  router.post("/clans", async (req, res) => {
    const owner = await ctx.store.getOrCreateUser(req.body.user || {});
    const name = safeText(req.body.name, 32);
    if (!name) return res.status(400).json({ ok: false, error: "Clan name required" });
    const clan = ctx.store.createClan({ name, owner });
    res.json({ ok: true, clan });
  });

  return router;
}

module.exports = { createApiRouter };
