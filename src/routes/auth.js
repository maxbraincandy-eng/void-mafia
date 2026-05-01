const express = require("express");
const bcrypt = require("bcryptjs");
const { sendVerificationCode } = require("../services/MailService");
const { getOrCreateUser } = require("../services/UserService");
const { safeText } = require("../utils/text");

const pending = new Map();

function createAuthRouter(ctx) {
  const router = express.Router();

  router.post("/guest", async (req, res) => {
    try {
      const user = await getOrCreateUser(ctx, req.body || {});
      res.json({ ok: true, user });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  router.post("/request-code", async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const nickname = safeText(req.body.nickname, 32);
    const password = String(req.body.password || "");
    const avatar = String(req.body.avatar || "◆");

    if (!email || !nickname || password.length < 6) {
      return res.status(400).json({ ok: false, error: "Email, nickname and 6+ password required" });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const passwordHash = await bcrypt.hash(password, 10);

    pending.set(email, {
      email,
      nickname,
      avatar,
      passwordHash,
      code,
      expiresAt: Date.now() + Number(process.env.EMAIL_CODE_TTL_MIN || 10) * 60 * 1000,
      attempts: 0
    });

    const sent = await sendVerificationCode(email, code);
    res.json({ ok: true, devCode: sent.devCode || null });
  });

  router.post("/verify-code", async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const code = String(req.body.code || "").trim();
    const rec = pending.get(email);

    if (!rec) return res.status(400).json({ ok: false, error: "No code requested" });
    if (Date.now() > rec.expiresAt) {
      pending.delete(email);
      return res.status(400).json({ ok: false, error: "Code expired" });
    }

    rec.attempts += 1;
    if (rec.attempts > 5) {
      pending.delete(email);
      return res.status(400).json({ ok: false, error: "Too many attempts" });
    }

    if (rec.code !== code) return res.status(400).json({ ok: false, error: "Invalid code" });

    const user = await getOrCreateUser(ctx, {
      nickname: rec.nickname,
      avatar: rec.avatar,
      email: rec.email,
      passwordHash: rec.passwordHash
    });

    pending.delete(email);
    res.json({ ok: true, user });
  });

  return router;
}

module.exports = { createAuthRouter };
