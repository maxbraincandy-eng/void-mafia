import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import passport from 'passport';
import {
  ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData,
} from './types/index.js';
import { attachSocketHandlers, setDbReady } from './socket.js';
import { getAllRooms, toRoomListItem, deleteRoom } from './services/roomService.js';
import { timerService } from './services/timerService.js';
import { getPlayer, toPublicProfile } from './services/playerService.js';
import { sql, initializeDatabase } from './db.js';
import { configurePassport, createAuthRouter } from './auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173';
const IS_PROD = process.env.NODE_ENV === 'production';

console.log('[Startup] Void Mafia server starting');
console.log(`[Startup] NODE_ENV=${process.env.NODE_ENV ?? 'development'}`);
console.log(`[Startup] PORT=${PORT}`);

const app = express();
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
});

// ── Middleware ────────────────────────────────────────────────────────
app.use(cors({
  origin: IS_PROD ? false : CLIENT_URL,
  credentials: true,
}));
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

// ── Rooms List ────────────────────────────────────────────────────────
app.get('/api/rooms', (_req, res) => {
  const list = getAllRooms()
    .filter(r => !r.settings.isPrivate && r.phase !== 'game_over')
    .map(toRoomListItem);
  res.json({ ok: true, data: list });
});

// ── Player Profile ────────────────────────────────────────────────────
app.get('/api/player/:id', async (req, res) => {
  const profile = await getPlayer(req.params.id!);
  if (!profile) { res.status(404).json({ ok: false, error: 'Not found' }); return; }
  res.json({ ok: true, data: toPublicProfile(profile) });
});

// ── Serve built client in production ─────────────────────────────────
if (IS_PROD) {
  const clientDist = path.resolve(__dirname, '../../client/dist');

  app.use(express.static(clientDist, {
    maxAge: '1y',
    immutable: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    },
  }));

  app.get('*', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(clientDist, 'index.html'));
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
