const express = require('express');
const { register, login, getOrCreateGuest, updateProfile } = require('../services/userService');

function createAuthRouter(ctx) {
  const r = express.Router();
  r.get('/me', (req, res) => res.json({ ok: true, user: req.session.user || null }));
  r.post('/guest', async (req, res) => {
    try { const user = await getOrCreateGuest(ctx, req.body); req.session.user = user; res.json({ ok: true, user }); }
    catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  });
  r.post('/register', async (req, res) => {
    try { const user = await register(ctx, req.body); req.session.user = user; res.json({ ok: true, user }); }
    catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  });
  r.post('/login', async (req, res) => {
    try { const user = await login(ctx, req.body.email, req.body.password); req.session.user = user; res.json({ ok: true, user }); }
    catch (e) { res.status(401).json({ ok: false, error: e.message }); }
  });
  r.put('/me', async (req, res) => {
    try { const id = req.session.user?.userId || req.body.userId; if (!id) throw Error('Login required'); const user = await updateProfile(ctx, id, req.body); req.session.user = user; res.json({ ok: true, user }); }
    catch (e) { res.status(400).json({ ok: false, error: e.message }); }
  });
  r.post('/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
  return r;
}
module.exports = { createAuthRouter };
