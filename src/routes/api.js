const express = require('express');
const { ROLES, DEFAULT_SETTINGS, publicRoom } = require('../gameEngine');
const { leaderboard, findUserById } = require('../services/userService');
const { createClan, listClans, joinClan } = require('../services/clanService');

const STORE = [
  { key: 'coins', title: 'Coins', description: 'In-game currency packs', price: 0, type: 'category' },
  { key: 'subscriptions', title: 'Subscriptions', description: 'Premium room and profile features', price: 0, type: 'category' },
  { key: 'frames', title: 'Frames', description: 'Neon avatar frames', price: 150, type: 'cosmetic' },
  { key: 'crystals', title: 'Crystals', description: 'Season rewards and clan upgrades', price: 0, type: 'category' },
  { key: 'blue_magic_ball', title: 'Blue Magic Ball', description: 'Fortune Teller extra reveal ability', price: 300, type: 'item' },
  { key: 'personal_colors', title: 'Personal Colors', description: 'Custom speaking glow and name color', price: 120, type: 'cosmetic' }
];
function createApiRouter(ctx) {
  const r = express.Router();
  r.get('/health', (req, res) => res.json({ ok: true, app: process.env.APP_NAME || 'VOID MAFIA v20', db: ctx.db.enabled ? 'enabled' : 'memory', rooms: ctx.rooms.size, online: ctx.onlineUsers.size, uptime: process.uptime() }));
  r.get('/webrtc', (req, res) => res.json({ ok: true, iceServers: ctx.webrtc.iceServers }));
  r.get('/roles', (req, res) => res.json({ ok: true, roles: ROLES, defaultSettings: DEFAULT_SETTINGS }));
  r.get('/rooms', (req, res) => res.json({ ok: true, rooms: [...ctx.rooms.values()].filter(x => x.phase !== 'ended').map(x => ({ id: x.id, name: x.name, phase: x.phase, hostName: x.hostName, players: x.players.length, maxPlayers: x.settings.maxPlayers, language: x.settings.language, privateRoom: x.settings.privateRoom })) }));
  r.get('/rooms/:id', (req, res) => { const room = ctx.rooms.get(String(req.params.id)); if (!room) return res.status(404).json({ ok: false, error: 'Room not found' }); res.json({ ok: true, room: publicRoom(room, Number(req.query.userId || 0)) }); });
  r.get('/leaderboard', async (req, res) => res.json({ ok: true, users: await leaderboard(ctx, 100) }));
  r.get('/users/:id', async (req, res) => { const u = await findUserById(ctx, req.params.id); if (!u) return res.status(404).json({ ok: false, error: 'User not found' }); res.json({ ok: true, user: u }); });
  r.get('/clans', async (req, res) => res.json({ ok: true, clans: await listClans(ctx) }));
  r.post('/clans', async (req, res) => { try { const owner = req.session.user || req.body.user; res.json({ ok: true, clan: await createClan(ctx, { ...req.body, owner }) }); } catch (e) { res.status(400).json({ ok: false, error: e.message }); } });
  r.post('/clans/:id/join', async (req, res) => { try { const user = req.session.user || req.body.user; res.json({ ok: true, clan: await joinClan(ctx, req.params.id, user) }); } catch (e) { res.status(400).json({ ok: false, error: e.message }); } });
  r.get('/store', (req, res) => res.json({ ok: true, items: STORE }));
  r.post('/reports', async (req, res) => { try { if (ctx.db.enabled) await ctx.db.models.Report.create({ reporterUserId: req.session.user?.userId || req.body.reporterUserId, targetUserId: req.body.targetUserId, roomId: req.body.roomId, reason: req.body.reason }); res.json({ ok: true }); } catch (e) { res.status(400).json({ ok: false, error: e.message }); } });
  return r;
}
module.exports = { createApiRouter };
