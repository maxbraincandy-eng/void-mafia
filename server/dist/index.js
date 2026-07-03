import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import passport from 'passport';
import Stripe from 'stripe';
import { attachSocketHandlers, setDbReady } from './socket.js';
import { getAllRooms, toRoomListItem, deleteRoom } from './services/roomService.js';
import { buildIceConfig } from './lib/iceConfig.js';
import { timerService } from './services/timerService.js';
import { getPlayer, getPlayerByPublicId, toPublicProfile } from './services/playerService.js';
import { getClanMembershipByPlayer } from './services/clanService.js';
import { getPlayerAchievements } from './services/achievementService.js';
import { sql, initializeDatabase } from './db.js';
import { configurePassport, createAuthRouter } from './auth.js';
import { initPushService, getVapidPublicKey } from './pushService.js';
import { creditPurchasedCoins, grantCoins } from './services/coinService.js';
import { computeTrending, settleWeeklyLeaderboard } from './services/communityService.js';
import { createHermesRouter } from './routes/hermes.js';
import { createLiveKitRouter } from './routes/livekitRoutes.js';
import { createGifRouter } from './routes/gifRoutes.js';
// ── Stripe setup ──────────────────────────────────────────────────────
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY ?? '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';
const stripe = STRIPE_SECRET ? new Stripe(STRIPE_SECRET) : null;
export const COIN_PACKAGES = [
    { id: 'coins_500', coins: 500, price: 499, label: '500 Coins', bonus: '' },
    { id: 'coins_1500', coins: 1500, price: 999, label: '1,500 Coins', bonus: '+200 bonus' },
    { id: 'coins_4000', coins: 4000, price: 1999, label: '4,000 Coins', bonus: '+500 bonus' },
    { id: 'coins_10000', coins: 10000, price: 3999, label: '10,000 Coins', bonus: '+2,000 bonus' },
];
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173';
const IS_PROD = process.env.NODE_ENV === 'production';
const CLIENT_BUILD = '2026-07-03-v265';
console.log('[Startup] Void Mafia server starting');
console.log(`[Startup] Client build: ${CLIENT_BUILD}`);
console.log(`[Startup] NODE_ENV=${process.env.NODE_ENV ?? 'development'}`);
console.log(`[Startup] PORT=${PORT}`);
const app = express();
// Railway / any reverse-proxy: trust the X-Forwarded-* headers so that
// req.protocol is 'https', secure cookies are set, and sessions persist.
app.set('trust proxy', 1);
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: IS_PROD ? false : [CLIENT_URL, 'http://localhost:5173'],
        methods: ['GET', 'POST'],
        credentials: true,
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 20000,
    pingInterval: 10000,
    upgradeTimeout: 10000,
    maxHttpBufferSize: 10 * 1024 * 1024, // 10MB — needed for voice message audio data
});
// ── Middleware ────────────────────────────────────────────────────────
app.use((req, res, next) => {
    // Allow same-origin requests in prod; in dev allow the Vite dev server
    if (IS_PROD) {
        res.setHeader('Access-Control-Allow-Origin', 'https://voidmafia.one');
    }
    else {
        res.setHeader('Access-Control-Allow-Origin', CLIENT_URL);
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,stripe-signature');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
    }
    next();
});
app.use(cookieParser());
app.use(session({
    secret: process.env.AUTH_SESSION_SECRET ?? 'void-mafia-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: IS_PROD,
        sameSite: IS_PROD ? 'none' : 'lax',
        maxAge: 10 * 60 * 1000, // 10 minutes — just long enough for OAuth callback
    },
}));
app.use(passport.initialize());
configurePassport();
app.use('/api/auth', createAuthRouter());
app.use(express.json());
app.use('/api/hermes', createHermesRouter());
app.use('/livekit', createLiveKitRouter());
app.use('/api/gif', createGifRouter());
// ── Lightweight health endpoint (no DB dependency) ────────────────────
// Railway healthcheck hits this — must always respond 200 instantly.
const BUILD_TIME = new Date().toISOString();
let dbReady = false;
app.get('/health', (_req, res) => {
    res.json({
        ok: true,
        service: 'void-mafia',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
    });
});
app.get('/api/version', (_req, res) => {
    res.json({ build: CLIENT_BUILD, startedAt: BUILD_TIME });
});
// Keep /api/health for backward compatibility
app.get('/api/health', (_req, res) => {
    res.json({
        ok: true,
        service: 'void-mafia',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        buildTime: BUILD_TIME,
        database: 'postgresql',
        dbReady,
    });
});
// ── DB health (separate — may be slow) ───────────────────────────────
app.get('/health/db', async (_req, res) => {
    try {
        const [userRow] = await sql `SELECT COUNT(*) as cnt FROM players`;
        const [clanRow] = await sql `SELECT COUNT(*) as cnt FROM clans`;
        const [matchRow] = await sql `SELECT COUNT(*) as cnt FROM game_history`;
        const [convRow] = await sql `SELECT COUNT(*) as cnt FROM conversations`;
        res.json({
            ok: true,
            connected: true,
            counts: {
                users: Number(userRow.cnt),
                clans: Number(clanRow.cnt),
                matches: Number(matchRow.cnt),
                conversations: Number(convRow.cnt),
            },
        });
    }
    catch (e) {
        res.status(503).json({ ok: false, connected: false, error: e.message });
    }
});
// ── WebRTC / ICE config endpoint ──────────────────────────────────────
// Used by clients to fetch TURN credentials without embedding them in the bundle.
// Also useful for debugging: curl https://voidmafia.one/api/webrtc
app.get('/api/webrtc', (_req, res) => {
    try {
        const cfg = buildIceConfig();
        res.json({ ok: true, iceServers: cfg.iceServers, iceTransportPolicy: cfg.iceTransportPolicy });
    }
    catch (e) {
        console.error('[/api/webrtc] error:', e.message);
        res.status(500).json({ ok: false, error: 'Failed to build ICE config' });
    }
});
// ── Rooms List ────────────────────────────────────────────────────────
app.get('/api/rooms', (_req, res) => {
    const list = getAllRooms()
        .filter(r => !r.settings.isPrivate && r.phase !== 'game_over')
        .map(toRoomListItem);
    res.json({ ok: true, data: list });
});
// ── Player Profile ────────────────────────────────────────────────────
app.get('/api/player/:id', async (req, res) => {
    const profile = await getPlayer(req.params.id);
    if (!profile) {
        res.status(404).json({ ok: false, error: 'Not found' });
        return;
    }
    res.json({ ok: true, data: toPublicProfile(profile) });
});
// ── Public Profile Card — no auth required ────────────────────────────
app.get('/api/u/:publicId', async (req, res) => {
    const publicId = parseInt(req.params.publicId ?? '', 10);
    if (!publicId || isNaN(publicId)) {
        res.status(400).json({ ok: false, error: 'Invalid ID' });
        return;
    }
    try {
        const profile = await getPlayerByPublicId(publicId);
        if (!profile) {
            res.status(404).json({ ok: false, error: 'Player not found' });
            return;
        }
        const [clan, achievements] = await Promise.all([
            getClanMembershipByPlayer(profile.id),
            getPlayerAchievements(profile.id),
        ]);
        res.json({ ok: true, data: {
                profile: toPublicProfile(profile),
                clan: clan ?? null,
                achievements: achievements.slice(0, 5),
            } });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: 'Internal error' });
    }
});
// ── Push Notifications ───────────────────────────────────────────────
app.get('/api/push/vapid-key', (_req, res) => {
    res.json({ publicKey: getVapidPublicKey() });
});
app.post('/api/push/subscribe', async (req, res) => {
    const userId = req.session?.profileId ?? req.session?.userId;
    if (!userId) {
        res.status(401).json({ ok: false, error: 'Not authenticated' });
        return;
    }
    const { endpoint, keys } = req.body ?? {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
        res.status(400).json({ ok: false, error: 'Invalid subscription' });
        return;
    }
    try {
        await sql `
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES (${userId}, ${endpoint}, ${keys.p256dh}, ${keys.auth})
      ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id
    `;
        res.json({ ok: true });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});
app.delete('/api/push/subscribe', async (req, res) => {
    const { endpoint } = req.body ?? {};
    if (!endpoint) {
        res.status(400).json({ ok: false });
        return;
    }
    await sql `DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
    res.json({ ok: true });
});
// ── Stripe: coin packages list ────────────────────────────────────────
app.get('/api/shop/packages', (_req, res) => {
    res.json({ ok: true, data: COIN_PACKAGES, stripeEnabled: !!stripe });
});
// ── Stripe: create checkout session ──────────────────────────────────
app.post('/api/shop/checkout', express.json(), async (req, res) => {
    if (!stripe) {
        res.status(503).json({ ok: false, error: 'Payments not configured.' });
        return;
    }
    const { packageId, profileId } = req.body ?? {};
    const pkg = COIN_PACKAGES.find(p => p.id === packageId);
    if (!pkg) {
        res.status(400).json({ ok: false, error: 'Invalid package.' });
        return;
    }
    if (!profileId || typeof profileId !== 'string') {
        res.status(400).json({ ok: false, error: 'Not authenticated.' });
        return;
    }
    try {
        const origin = IS_PROD ? 'https://voidmafia.one' : `http://localhost:5173`;
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            line_items: [{
                    price_data: {
                        currency: 'usd',
                        unit_amount: pkg.price,
                        product_data: {
                            name: `${pkg.label}${pkg.bonus ? ` (${pkg.bonus})` : ''}`,
                            description: `Void Mafia in-game coins`,
                            images: [],
                        },
                    },
                    quantity: 1,
                }],
            metadata: { profileId, packageId: pkg.id, coins: String(pkg.coins) },
            success_url: `${origin}/shop/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/`,
        });
        res.json({ ok: true, url: session.url });
    }
    catch (e) {
        console.error('[shop/checkout]', e.message);
        res.status(500).json({ ok: false, error: 'Failed to create checkout session.' });
    }
});
// ── Stripe: webhook ───────────────────────────────────────────────────
app.post('/api/shop/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!stripe) {
        res.status(503).end();
        return;
    }
    const sig = req.headers['stripe-signature'];
    if (!STRIPE_WEBHOOK_SECRET || !sig) {
        res.status(400).end();
        return;
    }
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    }
    catch (e) {
        console.error('[webhook] signature verification failed:', e.message);
        res.status(400).end();
        return;
    }
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const { profileId, coins } = session.metadata ?? {};
        if (profileId && coins) {
            try {
                await creditPurchasedCoins(profileId, parseInt(coins, 10), `Coin purchase (${session.id})`);
                console.log(`[shop] granted ${coins} coins to ${profileId}`);
            }
            catch (e) {
                console.error('[shop] grant coins failed:', e.message);
            }
        }
    }
    res.json({ received: true });
});
// ── Serve built client in production ─────────────────────────────────
if (IS_PROD) {
    const clientDist = path.resolve(__dirname, '../../client/dist');
    app.use(express.static(clientDist, {
        maxAge: '1y',
        immutable: true,
        etag: true,
        setHeaders: (res, filePath) => {
            const noCache = ['index.html', 'sw.js', 'manifest.json', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];
            if (noCache.some(f => filePath.endsWith(f))) {
                res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
                res.setHeader('Pragma', 'no-cache');
                res.setHeader('Expires', '0');
                res.removeHeader('ETag');
                res.removeHeader('Last-Modified');
            }
        },
    }));
    app.get('*', (_req, res) => {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.sendFile(path.join(clientDist, 'index.html'));
    });
}
// ── Stale Room Cleanup ────────────────────────────────────────────────
const GAME_OVER_TTL = 3 * 60 * 1000;
const EMPTY_ROOM_TTL = 2 * 60 * 1000;
setInterval(() => {
    const now = Date.now();
    for (const room of getAllRooms()) {
        const connected = [...room.players.values()].filter(p => p.isConnected && p.socketId).length;
        if (room.phase === 'game_over') {
            const gameOverSince = room._gameOverAt;
            if (gameOverSince && now - gameOverSince > GAME_OVER_TTL) {
                timerService.stop(room.id);
                deleteRoom(room.id);
                console.log(`[cleanup] deleted game_over room ${room.code}`);
            }
        }
        else if (connected === 0) {
            const emptyAt = room._emptyAt;
            if (emptyAt && now - emptyAt > EMPTY_ROOM_TTL) {
                timerService.stop(room.id);
                deleteRoom(room.id);
                console.log(`[cleanup] deleted empty room ${room.code}`);
            }
            else if (!emptyAt) {
                room._emptyAt = now;
            }
        }
        else {
            delete room._emptyAt;
        }
    }
}, 30000);
// ── Socket.IO ─────────────────────────────────────────────────────────
attachSocketHandlers(io);
console.log('[Socket.IO] ready');
// ── Start — bind to 0.0.0.0 so Railway can reach the process ─────────
// Listen FIRST so the healthcheck at /api/health responds immediately.
// DB init runs async in the background.
httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[Startup] Server listening on 0.0.0.0:${PORT}`);
    console.log(`[Startup] Health endpoint ready at /health and /api/health`);
});
async function tryInitDb(attempt = 1) {
    try {
        await initializeDatabase();
        dbReady = true;
        setDbReady(true);
        console.log('[Startup] Database ready.');
        initPushService().catch(e => console.warn('[Push] init failed:', e.message));
        setInterval(() => { computeTrending().catch(e => console.error('[Trending] compute failed:', e)); }, 10 * 60 * 1000);
        // Weekly leaderboard payout (top 3: 500/400/300). Runs on startup (back-pays
        // a missed week) and hourly (settles as soon as a new week begins). Idempotent.
        const runSettle = () => settleWeeklyLeaderboard((pid, amt, desc) => grantCoins('system', pid, amt, desc).then(() => { }))
            .then(r => { if (r)
            console.log(`[Leaderboard] payout done: ${r.paid} winner(s) for week ${new Date(r.weekStart).toISOString()}`); })
            .catch(e => console.error('[Leaderboard] settle failed:', e.message));
        runSettle();
        setInterval(runSettle, 60 * 60 * 1000);
    }
    catch (err) {
        console.error(`[Startup] DB init attempt ${attempt} failed: ${err.message}`);
        console.error('[Startup] Server stays alive. Retrying in 30s...');
        console.error('[Startup] ACTION REQUIRED: Link the Postgres service to @void-mafia/server in Railway dashboard → Variables → Add Reference → Postgres → DATABASE_URL');
        setTimeout(() => tryInitDb(attempt + 1), 30000);
    }
}
tryInitDb();
// ── Graceful shutdown ─────────────────────────────────────────────────
process.on('SIGTERM', () => { httpServer.close(() => process.exit(0)); });
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));
//# sourceMappingURL=index.js.map