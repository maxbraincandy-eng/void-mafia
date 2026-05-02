const express = require("express");
const { createGuestUser, registerUser, loginUser } = require("../db");

function createAuthRouter(runtime) {
  const router = express.Router();

  router.post("/guest", async (req, res) => {
    try { res.json({ ok: true, user: await createGuestUser(runtime.db, req.body || {}) }); }
    catch (err) { res.status(400).json({ ok: false, error: err.message }); }
  });

  router.post("/register", async (req, res) => {
    try { res.json({ ok: true, user: await registerUser(runtime.db, req.body || {}) }); }
    catch (err) { res.status(400).json({ ok: false, error: err.message }); }
  });

  router.post("/login", async (req, res) => {
    try { res.json({ ok: true, user: await loginUser(runtime.db, req.body || {}) }); }
    catch (err) { res.status(400).json({ ok: false, error: err.message }); }
  });

  return router;
}

module.exports = { createAuthRouter };
