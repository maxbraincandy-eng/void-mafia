const express = require("express");

const {
  ROLES,
  DEFAULT_SETTINGS,
  publicRoom
} = require("../services/gameEngine");

const {
  leaderboard,
  findUserById
} = require("../services/userService");

const {
  createClan,
  listClans,
  joinClan
} = require("../services/clanService");

function createApiRouter(ctx) {
  const r = express.Router();

  r.get("/health", (req, res) => {
    res.json({
      ok: true,
      app: "VOID MAFIA",
      version: "16.0.0-platform",
      mongodb: ctx.db?.enabled ? "connected" : "disabled",
      rooms: ctx.rooms ? ctx.rooms.size : 0
    });
  });

  r.get("/webrtc", (req, res) => {
    res.json({
      ok: true,
      iceServers: ctx.webrtc?.iceServers || []
    });
  });

  r.get("/roles", (req, res) => {
    res.json({
      ok: true,
      roles: ROLES,
      defaultSettings: DEFAULT_SETTINGS
    });
  });

  r.get("/rooms", (req, res) => {
    const rooms = Array.from(ctx.rooms.values()).map(room => ({
      id: room.id,
      name: room.name,
      phase: room.phase,
      hostName: room.hostName,
      hostUserId: room.hostUserId,
      players: room.players.length,
      maxPlayers: room.settings.maxPlayers,
      language: room.settings.language || "Georgian",
      createdAt: room.createdAt || Date.now()
    }));

    res.json({
      ok: true,
      rooms
    });
  });

  r.get("/rooms/:id", (req, res) => {
    const room = ctx.rooms.get(String(req.params.id));

    if (!room) {
      return res.status(404).json({
        ok: false,
        error: "Room not found"
      });
    }

    res.json({
      ok: true,
      room: publicRoom(room, Number(req.query.userId || 0))
    });
  });

  r.get("/leaderboard", async (req, res) => {
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

  r.get("/users/:id", async (req, res) => {
    try {
      const user = await findUserById(ctx, req.params.id);

      if (!user) {
        return res.status(404).json({
          ok: false,
          error: "User not found"
        });
      }

      res.json({
        ok: true,
        user
      });
    } catch (err) {
      console.error("GET /api/users/:id failed:", err);

      res.status(500).json({
        ok: false,
        error: "User load failed"
      });
    }
  });

  r.get("/clans", async (req, res) => {
    try {
      const clans = await listClans(ctx);

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

  r.post("/clans", async (req, res) => {
    try {
      const clan = await createClan(ctx, {
        name: req.body.name,
        tag: req.body.tag,
        emblem: req.body.emblem,
        owner: req.body.user
      });

      res.json({
        ok: true,
        clan
      });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err.message
      });
    }
  });

  r.post("/clans/:id/join", async (req, res) => {
    try {
      const clan = await joinClan(ctx, req.params.id, req.body.user);

      res.json({
        ok: true,
        clan
      });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err.message
      });
    }
  });

  r.get("/store", (req, res) => {
    res.json({
      ok: true,
      items: [
        {
          key: "voidPremium",
          title: "VOID Premium",
          price: 500,
          type: "subscription",
          owned: false,
          description: "პრემიუმ სტატუსი, პროფილის გამოკვეთა და სპეციალური ნიშანი."
        },
        {
          key: "roomBoost",
          title: "Room Boost",
          price: 150,
          type: "boost",
          owned: false,
          description: "შენი ოთახი დროებით სიის ზედა ნაწილში გამოჩნდება."
        },
        {
          key: "neonFrame",
          title: "Neon Profile Frame",
          price: 250,
          type: "frame",
          owned: false,
          description: "ნეონის ჩარჩო პროფილზე, ლობიში და რეიტინგში."
        },
        {
          key: "voidBadge",
          title: "VOID Badge",
          price: 200,
          type: "badge",
          owned: false,
          description: "სპეციალური ნიშანი შენს პროფილთან და სახელთან."
        },
        {
          key: "customAvatarSlot",
          title: "Custom Avatar Slot",
          price: 300,
          type: "profile",
          owned: false,
          description: "დამატებითი avatar სლოტი და პროფილის გაფორმება."
        },
        {
          key: "clanBanner",
          title: "Clan Banner",
          price: 400,
          type: "clan",
          owned: false,
          description: "კლანისთვის სპეციალური ბანერი და ვიზუალური გაფორმება."
        }
      ]
    });
  });

  return r;
}

module.exports = { createApiRouter };
