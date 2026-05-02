
const express = require("express");
const game = require("../socket/game");

function createApiRouter(ctx) {
  const router = express.Router();

  router.get("/health", async (req, res) => {
    res.json({
      ok: true,
      version: "13.0.0",
      mongodb: ctx.db?.connected ? "connected" : "memory",
      rooms: ctx.store?.rooms?.size || 0,
      clans: ctx.store?.clans?.size || 0,
      users: ctx.store?.users?.size || 0
    });
  });

  router.get("/rooms", async (req, res) => {
    try {
      const rooms = await ctx.store.listRooms();
      res.json({ ok: true, rooms });
    } catch (err) {
      console.error("GET /api/rooms failed:", err);
      res.status(500).json({ ok: false, error: "Rooms load failed" });
    }
  });

  router.post("/rooms", async (req, res) => {
    try {
      const user = req.body.user || {};
      const settings = req.body.settings || {};
      const name = req.body.name || settings.name || "VOID TABLE";

      const room = await ctx.store.createRoom({
        name,
        owner: user,
        settings
      });

      res.json({ ok: true, room });
    } catch (err) {
      console.error("POST /api/rooms failed:", err);
      res.status(500).json({ ok: false, error: "Room create failed" });
    }
  });

  router.get("/clans", async (req, res) => {
    try {
      const clans = await ctx.store.listClans();
      res.json({ ok: true, clans });
    } catch (err) {
      console.error("GET /api/clans failed:", err);
      res.status(500).json({ ok: false, error: "Clans load failed" });
    }
  });

  router.post("/clans", async (req, res) => {
    try {
      const name = String(req.body.name || "").trim();
      const user = req.body.user || {};

      if (!name) {
        return res.status(400).json({
          ok: false,
          error: "კლანის სახელი აუცილებელია"
        });
      }

      if (!user.userId) {
        return res.status(401).json({
          ok: false,
          error: "ჯერ ავტორიზაცია გაიარე"
        });
      }

      const clan = await ctx.store.createClan({
        name,
        owner: user
      });

      res.json({ ok: true, clan });
    } catch (err) {
      console.error("POST /api/clans failed:", err);
      res.status(500).json({ ok: false, error: "Clan create failed" });
    }
  });

  router.get("/leaderboard", async (req, res) => {
    try {
      const users = await ctx.store.leaderboard();
      res.json({ ok: true, users });
    } catch (err) {
      console.error("GET /api/leaderboard failed:", err);
      res.status(500).json({ ok: false, error: "Leaderboard load failed" });
    }
  });

  router.get("/roles", (req, res) => {
    res.json({
      ok: true,
      roles: game.ROLES || []
    });
  });

  return router;
}

module.exports = { createApiRouter };
