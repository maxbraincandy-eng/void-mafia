import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { createServer } from 'http';
import fs from 'fs';
import { Server } from 'socket.io';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import passport from 'passport';
import Stripe from 'stripe';
import { genitive } from './services/georgian.js';
import {
  ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData,
} from './types/index.js';
import { attachSocketHandlers, setDbReady } from './socket.js';
import { getAllRooms, toRoomListItem, deleteRoom } from './services/roomService.js';
import { buildIceConfig } from './lib/iceConfig.js';
import { timerService } from './services/timerService.js';
import { getPlayer, getPlayerByPublicId, toPublicProfile } from './services/playerService.js';
import { getClanMembershipByPlayer } from './services/clanService.js';
import { getPlayerAchievements } from './services/achievementService.js';
import { sql, initializeDatabase } from './db.js';
import { assertSocialOnly } from './poker/compliance.js';
import { pokerEnabled } from './poker/poker.js';
import { configurePassport, createAuthRouter } from './auth.js';
import { initPushService, getVapidPublicKey, sendPushToUser as _sendPush } from './pushService.js';
import { creditPurchasedCoins, creditStorePurchase, grantCoins } from './services/coinService.js';
import { computeTrending, settleWeeklyLeaderboard } from './services/communityService.js';
import { createHermesRouter } from './routes/hermes.js';
import { createLiveKitRouter } from './routes/livekitRoutes.js';
import { createGifRouter } from './routes/gifRoutes.js';
import { createOEmbedRouter } from './routes/oembedRoutes.js';

// ── Stripe setup ──────────────────────────────────────────────────────
const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY ?? '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';
const stripe = STRIPE_SECRET ? new Stripe(STRIPE_SECRET) : null;

// RevenueCat webhook shared secret. Set this to the same value you enter in the
// RevenueCat dashboard → Integrations → Webhooks → Authorization header.
const REVENUECAT_WEBHOOK_AUTH = process.env.REVENUECAT_WEBHOOK_AUTH ?? '';

export const COIN_PACKAGES = [
  { id: 'coins_500',   coins: 500,   price: 499,   label: '500 Coins',    bonus: '' },
  { id: 'coins_1500',  coins: 1500,  price: 999,   label: '1,500 Coins',  bonus: '+200 bonus' },
  { id: 'coins_4000',  coins: 4000,  price: 1999,  label: '4,000 Coins',  bonus: '+500 bonus' },
  { id: 'coins_10000', coins: 10000, price: 3999,  label: '10,000 Coins', bonus: '+2,000 bonus' },
] as const;

// Map a store product id → coin amount. Store product ids are configured to
// match the package ids above (coins_500, coins_1500, …), so the native app,
// the web shop, and RevenueCat all speak the same product ids.
function coinsForProduct(productId: string): number | null {
  const pkg = COIN_PACKAGES.find(p => p.id === productId);
  return pkg ? pkg.coins : null;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173';
const IS_PROD = process.env.NODE_ENV === 'production';

const CLIENT_BUILD = '2026-07-28-v664';
console.log('[Startup] Void Mafia server starting');
console.log(`[Startup] Client build: ${CLIENT_BUILD}`);
console.log(`[Startup] NODE_ENV=${process.env.NODE_ENV ?? 'development'}`);
console.log(`[Startup] PORT=${PORT}`);

/*
 * Social poker ships with a "chips have no monetary value" notice. This check
 * refuses to start the process if any capability that would make that untrue
 * has been switched on — the product must never be able to serve the notice
 * while running code that contradicts it. See docs/poker/11-legal-compliance-checklist.md.
 */
assertSocialOnly();
console.log(`[Startup] Poker: ${pokerEnabled() ? 'enabled' : 'disabled'} (social-only checks passed)`);

const app = express();
// Railway / any reverse-proxy: trust the X-Forwarded-* headers so that
// req.protocol is 'https', secure cookies are set, and sessions persist.
app.set('trust proxy', 1);
const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>(httpServer, {
  cors: {
    origin: IS_PROD ? false : [CLIENT_URL, 'http://localhost:5173'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 20_000,
  pingInterval: 10_000,
  upgradeTimeout: 10_000,
  // 10MB covered voice messages; M.A.R.S. preservation records carry a
  // portrait plus up to five documents, so the frame ceiling has to clear the
  // service's own attachment caps or a valid upload dies at the transport.
  maxHttpBufferSize: 48 * 1024 * 1024,
});

// ── Middleware ────────────────────────────────────────────────────────
app.use((req, res, next) => {
  // Allow same-origin requests in prod; in dev allow the Vite dev server
  if (IS_PROD) {
    res.setHeader('Access-Control-Allow-Origin', 'https://voidmafia.one');
  } else {
    res.setHeader('Access-Control-Allow-Origin', CLIENT_URL);
  }
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,stripe-signature');
  if (req.method === 'OPTIONS') { res.sendStatus(200); return; }
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
app.use('/api/oembed', createOEmbedRouter());

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
    const [userRow]  = await sql`SELECT COUNT(*) as cnt FROM players` as any[];
    const [clanRow]  = await sql`SELECT COUNT(*) as cnt FROM clans` as any[];
    const [matchRow] = await sql`SELECT COUNT(*) as cnt FROM game_history` as any[];
    const [convRow]  = await sql`SELECT COUNT(*) as cnt FROM conversations` as any[];
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
  } catch (e: any) {
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
  } catch (e: any) {
    console.error('[/api/webrtc] error:', e.message);
    res.status(500).json({ ok: false, error: 'Failed to build ICE config' });
  }
});

// ── Rooms List ────────────────────────────────────────────────────────
app.get('/api/rooms', (_req, res) => {
  const list = getAllRooms()
    .filter(r => !r.settings.isPrivate && r.phase !== 'game_over')
    .map(toRoomListItem)
    // VIP "Room Spotlight" perk: spotlighted rooms float to the top. Within each
    // group the pre-existing order (creation) is preserved by the stable sort.
    .sort((a, b) => Number(b.spotlight ?? false) - Number(a.spotlight ?? false));
  res.json({ ok: true, data: list });
});

// ── Player Profile ────────────────────────────────────────────────────
app.get('/api/player/:id', async (req, res) => {
  const profile = await getPlayer(req.params.id!);
  if (!profile) { res.status(404).json({ ok: false, error: 'Not found' }); return; }
  res.json({ ok: true, data: toPublicProfile(profile) });
});

// ── Public Profile Card — no auth required ────────────────────────────
app.get('/api/u/:publicId', async (req, res) => {
  const publicId = parseInt(req.params.publicId ?? '', 10);
  if (!publicId || isNaN(publicId)) { res.status(400).json({ ok: false, error: 'Invalid ID' }); return; }
  try {
    const profile = await getPlayerByPublicId(publicId);
    if (!profile) { res.status(404).json({ ok: false, error: 'Player not found' }); return; }
    const [clan, achievements] = await Promise.all([
      getClanMembershipByPlayer(profile.id),
      getPlayerAchievements(profile.id),
    ]);
    res.json({ ok: true, data: {
      profile: toPublicProfile(profile),
      clan: clan ?? null,
      achievements: achievements.slice(0, 5),
    }});
  } catch (e: any) {
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
});

// ── Push Notifications ───────────────────────────────────────────────
app.get('/api/push/vapid-key', (_req, res) => {
  res.json({ publicKey: getVapidPublicKey() });
});

app.post('/api/push/subscribe', async (req, res) => {
  const userId = (req.session as any)?.profileId ?? (req.session as any)?.userId;
  if (!userId) { res.status(401).json({ ok: false, error: 'Not authenticated' }); return; }
  const { endpoint, keys } = req.body ?? {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) { res.status(400).json({ ok: false, error: 'Invalid subscription' }); return; }
  try {
    await sql`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES (${userId}, ${endpoint}, ${keys.p256dh}, ${keys.auth})
      ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id
    `;
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ ok: false, error: e.message }); }
});

app.delete('/api/push/subscribe', async (req, res) => {
  const { endpoint } = req.body ?? {};
  if (!endpoint) { res.status(400).json({ ok: false }); return; }
  await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
  res.json({ ok: true });
});

// ── Stripe: coin packages list ────────────────────────────────────────
app.get('/api/shop/packages', (_req, res) => {
  res.json({ ok: true, data: COIN_PACKAGES, stripeEnabled: !!stripe });
});

// ── Stripe: create checkout session ──────────────────────────────────
app.post('/api/shop/checkout', express.json(), async (req, res) => {
  if (!stripe) { res.status(503).json({ ok: false, error: 'Payments not configured.' }); return; }
  const { packageId, profileId } = req.body ?? {};
  const pkg = COIN_PACKAGES.find(p => p.id === packageId);
  if (!pkg) { res.status(400).json({ ok: false, error: 'Invalid package.' }); return; }
  if (!profileId || typeof profileId !== 'string') { res.status(400).json({ ok: false, error: 'Not authenticated.' }); return; }
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
  } catch (e: any) {
    console.error('[shop/checkout]', e.message);
    res.status(500).json({ ok: false, error: 'Failed to create checkout session.' });
  }
});

// ── Stripe: webhook ───────────────────────────────────────────────────
app.post('/api/shop/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) { res.status(503).end(); return; }
  const sig = req.headers['stripe-signature'] as string;
  if (!STRIPE_WEBHOOK_SECRET || !sig) { res.status(400).end(); return; }
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (e: any) {
    console.error('[webhook] signature verification failed:', e.message);
    res.status(400).end(); return;
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const { profileId, coins } = session.metadata ?? {};
    if (profileId && coins) {
      try {
        await creditPurchasedCoins(profileId, parseInt(coins, 10), `Coin purchase (${session.id})`);
        console.log(`[shop] granted ${coins} coins to ${profileId}`);
      } catch (e: any) {
        console.error('[shop] grant coins failed:', e.message);
      }
    }
  }
  res.json({ received: true });
});

// ── In-app purchases (Google Play / Apple via RevenueCat) ─────────────
// Digital goods sold inside the native app MUST use store billing, not Stripe.
// The native client buys through RevenueCat; RevenueCat then calls the webhook
// below server-to-server, and we credit coins idempotently.

// Product catalog for the native shop. Prices come from the store (RevenueCat
// offerings) at runtime; this just tells the app which product ids exist and
// how many coins each grants, so the UI can label them consistently.
app.get('/api/iap/products', (_req, res) => {
  res.json({
    ok: true,
    data: COIN_PACKAGES.map(p => ({ productId: p.id, coins: p.coins, label: p.label, bonus: p.bonus })),
    revenueCatEnabled: !!REVENUECAT_WEBHOOK_AUTH,
  });
});

// RevenueCat webhook. Configure in RevenueCat → Integrations → Webhooks with the
// Authorization header set to REVENUECAT_WEBHOOK_AUTH. The app_user_id must be
// set to the player's profile id by the client at login (Purchases.logIn).
app.post('/api/iap/revenuecat', express.json(), async (req, res) => {
  if (!REVENUECAT_WEBHOOK_AUTH) { res.status(503).json({ ok: false, error: 'IAP not configured.' }); return; }
  if (req.headers['authorization'] !== REVENUECAT_WEBHOOK_AUTH) {
    console.warn('[iap] rejected webhook: bad authorization header');
    res.status(401).json({ ok: false }); return;
  }
  const event = (req.body && req.body.event) || {};
  const type: string = event.type ?? '';
  // One-time coin packs arrive as NON_RENEWING_PURCHASE (and INITIAL_PURCHASE for
  // some store setups). Ignore refunds/cancellations here — those don't credit.
  const CREDIT_TYPES = ['INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE', 'RENEWAL'];
  if (!CREDIT_TYPES.includes(type)) {
    res.json({ ok: true, ignored: type || 'unknown' }); return;
  }
  const profileId: string = event.app_user_id ?? '';
  const productId: string = event.product_id ?? '';
  // RevenueCat's store transaction id (falls back to the event id).
  const transactionId: string = event.transaction_id ?? event.store_transaction_id ?? event.id ?? '';
  const coins = coinsForProduct(productId);

  if (!profileId || !productId || !transactionId) {
    res.status(400).json({ ok: false, error: 'Missing app_user_id/product_id/transaction_id.' }); return;
  }
  if (coins == null) {
    console.warn(`[iap] unknown product_id: ${productId}`);
    res.json({ ok: true, ignored: 'unknown_product' }); return;
  }

  try {
    const store = (event.store ?? 'revenuecat').toLowerCase(); // 'app_store' | 'play_store' | …
    const result = await creditStorePurchase({
      profileId,
      platform: `rc_${store}`,
      transactionId,
      productId,
      coins,
      raw: event,
    });
    if (result.credited) {
      console.log(`[iap] credited ${coins} coins to ${profileId} (${productId}, ${transactionId})`);
    } else {
      console.log(`[iap] duplicate purchase ignored (${transactionId})`);
    }
    res.json({ ok: true, credited: result.credited });
  } catch (e: any) {
    console.error('[iap] credit failed:', e.message);
    res.status(500).json({ ok: false, error: 'Credit failed.' });
  }
});

// ── Serve built client in production ─────────────────────────────────
if (IS_PROD) {
  const clientDist = path.resolve(__dirname, '../../client/dist');

  app.use(express.static(clientDist, {
    maxAge: '1y',
    immutable: true,
    etag: true,
    // Do NOT let static resolve "/" to index.html: the catch-all below decides
    // which shell a request gets, and static running first meant a request to
    // mars.<domain>/ was answered with the mafia app before that choice was
    // ever made. Hashed assets are still served from here.
    index: false,
    setHeaders: (res, filePath) => {
      const noCache = ['index.html', 'sw.js', 'manifest.json', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'];
      if (noCache.some(f => filePath.endsWith(f))) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.removeHeader('ETag');
        res.removeHeader('Last-Modified');
        return;
      }

      // `immutable` above is a promise that a URL's content will never change,
      // and it is one only Vite's output can keep: everything it emits under
      // /assets carries a content hash, so a new picture means a new URL.
      // Files copied verbatim out of public/ keep their name forever, and
      // marking those immutable froze them in every browser that had already
      // fetched one — the nav artwork was replaced and phones kept showing the
      // old set for what would have been a year. Unhashed files revalidate.
      const isHashedAsset = filePath.includes(`${path.sep}assets${path.sep}`)
        && /[.-][A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(path.basename(filePath));
      if (!isHashedAsset) {
        res.setHeader('Cache-Control', 'public, max-age=300, must-revalidate');
      }
    },
  }));

  /**
   * M.A.R.S. is served as its own site from the same build.
   *
   * Two ways in, deliberately:
   *   - any host beginning with "mars." serves it at the ROOT, so pointing a
   *     subdomain at this deployment makes M.A.R.S. the whole site with no
   *     further work and no second server;
   *   - /mars serves it today, before any DNS exists.
   *
   * Both fall through to mars.html rather than index.html, so a deep link like
   * /mars#/r/2162-X survives a refresh.
   */
  const isMarsHost = (req: express.Request): boolean =>
    /^mars\./i.test((req.hostname ?? '').trim());

  const esc = (v: string) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  /**
   * The portrait of a record, served as real image bytes.
   *
   * Share previews are what make a memorial travel — a link with no picture
   * reads as spam. Facebook and WhatsApp fetch og:image with a crawler that
   * runs no JavaScript and does not accept data: URIs, so the portrait stored
   * as a data URL has to be decoded and served from a URL of its own.
   */
  app.get('/mars/og/:code', async (req, res) => {
    try {
      const { getSubjectByCode } = await import('./services/marsService.js');
      const s = await getSubjectByCode(String(req.params.code ?? ''));
      const m = s && !s.hidden && s.portrait
        ? /^data:(image\/[a-z]+);base64,(.+)$/.exec(s.portrait) : null;
      if (!m) { res.status(404).end(); return; }
      res.setHeader('Content-Type', m[1]);
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.end(Buffer.from(m[2], 'base64'));
    } catch { res.status(404).end(); }
  });

  /**
   * A photograph or a voice recording, served as bytes.
   *
   * The socket hands the page ids; the browser fetches the media here. That is
   * what makes a gallery workable: the images are cached by the browser like
   * any other image, and audio can be SEEKED, because this endpoint answers
   * byte-range requests. Without range support, Safari refuses to play at all
   * and every scrub re-downloads the clip.
   */
  app.get('/mars/:kind(photo|voice)/:id', async (req, res) => {
    try {
      const { getMediaWithData } = await import('./services/marsMedia.js');
      const item = await getMediaWithData(String(req.params.id ?? ''));
      const wanted = req.params.kind === 'voice' ? 'voice' : 'photo';
      // A withdrawn record stops serving its media too — otherwise hiding a
      // page would leave its pictures reachable by anyone holding a link.
      if (!item || item.kind !== wanted || item.subjectHidden) { res.status(404).end(); return; }

      const comma = item.data.indexOf(',');
      const buf = Buffer.from(item.data.slice(comma + 1), 'base64');
      res.setHeader('Content-Type', item.mime);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Accept-Ranges', 'bytes');

      const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
      if (range) {
        const start = range[1] ? Number(range[1]) : 0;
        const end = range[2] ? Math.min(Number(range[2]), buf.length - 1) : buf.length - 1;
        if (!(start >= 0 && start <= end && end < buf.length)) {
          res.status(416).setHeader('Content-Range', `bytes */${buf.length}`).end();
          return;
        }
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${buf.length}`);
        res.setHeader('Content-Length', String(end - start + 1));
        res.end(buf.subarray(start, end + 1));
        return;
      }
      res.setHeader('Content-Length', String(buf.length));
      res.end(buf);
    } catch { res.status(404).end(); }
  });

  /**
   * Per-record share tags, injected server-side.
   *
   * Crawlers do not run the app, so a hash route can never produce a preview.
   * /mars/r/<code> is therefore the canonical shareable URL, and the shell it
   * returns carries that person's name, years and portrait in its meta tags.
   */
  async function marsShell(req: express.Request): Promise<string> {
    const file = path.join(clientDist, 'mars.html');
    const raw = await fs.promises.readFile(file, 'utf8');
    const code = /^\/mars\/r\/([\w-]+)/i.exec(req.path)?.[1];
    if (!code) return raw;
    try {
      const { getSubjectByCode } = await import('./services/marsService.js');
      const s = await getSubjectByCode(code);
      if (!s || s.hidden) return raw;

      const name = s.kind === 'memorial' && s.personFirst
        ? `${s.personFirst} ${s.personLast}`.trim() : s.designation;
      const years = s.lifeStatus === 'deceased'
        ? [s.bornYear, s.diedYear].filter(Boolean).join(' — ') : '';
      const title = `${name}${years ? ` (${years})` : ''} — M.A.R.S.`;
      const desc = s.lifeStatus === 'deceased'
        ? `${genitive(name)} ჩანაწერი. წაიკითხე, დაამატე მოგონება, ან დაუსვი კითხვა.`
        : `${genitive(name)} ჩანაწერი M.A.R.S.-ის არქივში.`;
      const origin = `${req.protocol}://${req.get('host')}`;
      const image = s.portrait ? `${origin}/mars/og/${encodeURIComponent(s.code)}` : '';

      return raw
        .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
        .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
        .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
        .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
        .replace('</head>', `${image
          ? `<meta property="og:image" content="${esc(image)}">\n<meta name="twitter:image" content="${esc(image)}">\n`
          : ''}<meta property="og:url" content="${esc(origin + req.path)}">\n</head>`);
    } catch { return raw; }
  }

  app.get('*', async (req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    const wantsMars = isMarsHost(req) || req.path === '/mars' || req.path.startsWith('/mars/');
    if (!wantsMars) { res.sendFile(path.join(clientDist, 'index.html')); return; }
    try {
      res.type('html').send(await marsShell(req));
    } catch {
      res.sendFile(path.join(clientDist, 'mars.html'));
    }
  });
}

// ── Stale Room Cleanup ────────────────────────────────────────────────
const GAME_OVER_TTL  = 3 * 60 * 1000;
const EMPTY_ROOM_TTL = 2 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const room of getAllRooms()) {
    const connected = [...room.players.values()].filter(p => p.isConnected && p.socketId).length;
    if (room.phase === 'game_over') {
      const gameOverSince = (room as any)._gameOverAt as number | undefined;
      if (gameOverSince && now - gameOverSince > GAME_OVER_TTL) {
        timerService.stop(room.id);
        deleteRoom(room.id);
        console.log(`[cleanup] deleted game_over room ${room.code}`);
      }
    } else if (connected === 0) {
      const emptyAt = (room as any)._emptyAt as number | undefined;
      if (emptyAt && now - emptyAt > EMPTY_ROOM_TTL) {
        timerService.stop(room.id);
        deleteRoom(room.id);
        console.log(`[cleanup] deleted empty room ${room.code}`);
      } else if (!emptyAt) {
        (room as any)._emptyAt = now;
      }
    } else {
      delete (room as any)._emptyAt;
    }
  }
}, 30_000);

// ── Socket.IO ─────────────────────────────────────────────────────────
attachSocketHandlers(io);
console.log('[Socket.IO] ready');

// ── AI bot chatter (owner-added bots talk in Georgian via Hermes) ─────
import('./ai/hermesProvider.js').then(async ({ initAIProvider }) => {
  await initAIProvider();
  const { startAiBots } = await import('./aiBotService.js');
  startAiBots(io);
}).catch(e => console.warn('[AI bots] init skipped:', e?.message));

// ── Start — bind to 0.0.0.0 so Railway can reach the process ─────────
// Listen FIRST so the healthcheck at /api/health responds immediately.
// DB init runs async in the background.
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`[Startup] Server listening on 0.0.0.0:${PORT}`);
  console.log(`[Startup] Health endpoint ready at /health and /api/health`);
});

async function tryInitDb(attempt = 1): Promise<void> {
  try {
    await initializeDatabase();
    dbReady = true;
    setDbReady(true);
    console.log('[Startup] Database ready.');
    // Poker's schema, sinks and scheduled jobs. Only when poker is enabled —
    // a deployment with it switched off should not carry its tables around.
    if (pokerEnabled()) {
      import('./poker/services/persistence.js').then(async poker => {
        await poker.initializePokerSchema();
        const { setPokerSinks } = await import('./poker/poker.js');
        setPokerSinks({ audit: poker.recordAudit, history: poker.recordHand });
        poker.rebuildLeaderboards();
        setInterval(() => { poker.rebuildLeaderboards(); }, 10 * 60 * 1000);
        setInterval(() => { poker.pruneOldRecords(); }, 24 * 60 * 60 * 1000);
        console.log('[Startup] Poker persistence ready.');
      }).catch(e => console.warn('[poker] persistence init failed:', e.message));
    }
    // Rescue legitimate IQ attempts wrongly flagged unverified by older builds.
    import('./services/iqService.js')
      .then(m => m.reconcileVerification())
      .then(n => { if (n > 0) console.log(`[VOID IQ] reconciled ${n} attempt(s) → verified`); })
      .catch(e => console.warn('[VOID IQ] reconcile failed:', e.message));
    initPushService().catch(e => console.warn('[Push] init failed:', e.message));
    // Keep the synchronous VIP snapshot warm — the mafia phase machine and the
    // spectator queue read it from places that cannot await. See vipService.
    import('./services/vipService.js')
      .then(m => m.startVipSnapshotRefresh())
      .catch(e => console.warn('[vip] snapshot start failed:', e.message));
    setInterval(() => { computeTrending().catch(e => console.error('[Trending] compute failed:', e)); }, 10 * 60 * 1000);

    /*
     * Reap broadcasts that stopped beating.
     *
     * A host whose battery dies never sends an end. Without this their avatar
     * wears a LIVE ring until somebody files a bug, and tapping it opens an
     * empty room — which is the worst version of this feature failing, because
     * it looks like the app lying rather than like a stream ending.
     *
     * Runs on startup too: after a restart nobody is connected to anything, so
     * every session that survived the restart is stale by definition.
     */
    import('./services/liveService.js').then(live => {
      const reap = () => live.reapStale()
        .then(n => { if (n > 0) console.log(`[Live] reaped ${n} stale session(s)`); })
        .catch(e => console.error('[Live] reap failed:', e.message));
      reap();
      setInterval(reap, 20 * 1000).unref();
    }).catch(e => console.warn('[Live] reaper not started:', e.message));

    // Weekly leaderboard payout (top 3: 500/400/300). Runs on startup (back-pays
    // a missed week) and hourly (settles as soon as a new week begins). Idempotent.
    const runSettle = () => settleWeeklyLeaderboard((pid, amt, desc) => grantCoins('system', pid, amt, desc).then(() => {}))
      .then(r => { if (r) console.log(`[Leaderboard] payout done: ${r.paid} winner(s) for week ${new Date(r.weekStart).toISOString()}`); })
      .catch(e => console.error('[Leaderboard] settle failed:', e.message));
    runSettle();
    setInterval(runSettle, 60 * 60 * 1000);

    // Clan League weekly payout (top 3 clans, coins to every contributing
    // member). Same cadence and the same reasoning as above: settlement claims
    // each week's row before paying, so startup + hourly cannot double-pay.
    const runLeague = () => import('./services/clanLeagueService.js')
      .then(m => m.settleLeague(
        (pid, amt, desc) => grantCoins('system', pid, amt, desc).then(() => {}),
        (pid, title, body) => import('./services/communityService.js')
          .then(c => c.createNotification(pid, 'leaderboard_reward', title, body, null))
          .then(() => {}),
      ))
      .then(rs => { for (const r of rs) console.log(`[ClanLeague] week ${new Date(r.weekStart).toISOString()}: ${r.paidClans} clan(s), ${r.paidPlayers} player(s)`); })
      .catch(e => console.error('[ClanLeague] settle failed:', e.message));
    runLeague();
    setInterval(runLeague, 60 * 60 * 1000);
  } catch (err: any) {
    console.error(`[Startup] DB init attempt ${attempt} failed: ${err.message}`);
    console.error('[Startup] Server stays alive. Retrying in 30s...');
    console.error('[Startup] ACTION REQUIRED: Link the Postgres service to @void-mafia/server in Railway dashboard → Variables → Add Reference → Postgres → DATABASE_URL');
    setTimeout(() => tryInitDb(attempt + 1), 30_000);
  }
}

tryInitDb();

// ── Graceful shutdown ─────────────────────────────────────────────────
process.on('SIGTERM', () => { httpServer.close(() => process.exit(0)); });
process.on('uncaughtException',  (err)    => console.error('[uncaughtException]', err));
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));
