const express = require("express");
const { getProfile, updateProfile, cleanText } = require("../db");
const { ROLE_OPTIONS, publicRoom } = require("../game");

function createApiRouter(runtime) {
  const router = express.Router();

  router.get("/roles", (req, res) => res.json({ ok: true, roles: ROLE_OPTIONS }));

  router.get("/rooms", (req, res) => {
    res.json({ ok: true, rooms: Array.from(runtime.rooms.values()).map(publicRoom) });
  });

  router.get("/users/:userId/profile", async (req, res) => {
    try {
      const profile = await getProfile(runtime.db, req.params.userId);
      if (!profile) return res.status(404).json({ ok: false, error: "მოთამაშე ვერ მოიძებნა" });
      res.json({ ok: true, profile });
    } catch {
      res.status(500).json({ ok: false, error: "პროფილის ჩატვირთვა ვერ მოხერხდა" });
    }
  });

  router.patch("/users/:userId/profile", async (req, res) => {
    try {
      const profile = await updateProfile(runtime.db, req.params.userId, req.body || {});
      if (!profile) return res.status(404).json({ ok: false, error: "მოთამაშე ვერ მოიძებნა" });
      res.json({ ok: true, profile });
    } catch {
      res.status(500).json({ ok: false, error: "პროფილის შენახვა ვერ მოხერხდა" });
    }
  });

  router.get("/clans", async (req, res) => {
    try {
      if (!runtime.db.enabled) return res.json({ ok: true, clans: [] });
      const clans = await runtime.db.models.Clan.find({}).sort({ points: -1, createdAt: -1 }).lean();
      res.json({ ok: true, clans });
    } catch (err) {
      console.error("GET clans failed:", err);
      res.status(500).json({ ok: false, error: "კლანების ჩატვირთვა ვერ მოხერხდა" });
    }
  });

  router.post("/clans", async (req, res) => {
    try {
      if (!runtime.db.enabled) return res.status(400).json({ ok: false, error: "კლანებისთვის MongoDB აუცილებელია" });
      const name = cleanText(req.body?.name, 32);
      const user = req.body?.user || {};
      const userId = Number(user.userId);
      if (!name) return res.status(400).json({ ok: false, error: "კლანის სახელი აუცილებელია" });
      if (!userId) return res.status(400).json({ ok: false, error: "ჯერ შედი ანგარიშში" });

      const exists = await runtime.db.models.Clan.findOne({ leaderUserId: userId });
      if (exists) return res.status(400).json({ ok: false, error: "შენ უკვე გაქვს კლანი" });

      const clan = await runtime.db.models.Clan.create({
        clanId: `clan_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
        name,
        emblem: user.avatar || "◆",
        leaderUserId: userId,
        leaderName: user.nickname || "Player",
        members: [userId]
      });

      await runtime.db.models.User.findOneAndUpdate({ userId }, { $set: { clanId: clan.clanId } });
      res.json({ ok: true, clan });
    } catch (err) {
      console.error("POST clans failed:", err);
      res.status(500).json({ ok: false, error: "კლანის შექმნა ვერ მოხერხდა" });
    }
  });

  router.get("/leaderboard", async (req, res) => {
    try {
      if (!runtime.db.enabled) return res.json({ ok: true, users: [] });
      const users = await runtime.db.models.User.find({}).sort({ "stats.xp": -1, "stats.wins": -1 }).limit(100).lean();
      res.json({ ok: true, users });
    } catch {
      res.status(500).json({ ok: false, error: "სტატისტიკა ვერ ჩაიტვირთა" });
    }
  });

  return router;
}

module.exports = { createApiRouter };
