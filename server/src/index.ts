import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import {
  ServerToClientEvents, ClientToServerEvents, InterServerEvents, SocketData,
} from './types/index.js';
import { attachSocketHandlers } from './socket.js';
import { getAllRooms, toRoomListItem, deleteRoom } from './services/roomService.js';
import { timerService } from './services/timerService.js';
import { getPlayer, toPublicProfile, getAllPlayers } from './services/playerService.js';
import { sql, initializeDatabase } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173';
const IS_PROD = process.env.NODE_ENV === 'production';

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
app.use(express.json());

// ── Health Check ──────────────────────────────────────────────────────
const BUILD_TIME = new Date().toISOString();
let dbReady = false;
// Mark DB as ready once init completes (set below after initializeDatabase resolves)

app.get('/api/health', (_req, res) => {
  const rooms = getAllRooms();
  res.json({
    ok: true,
    uptime: process.uptime(),
    rooms: rooms.length,
    players: rooms.reduce((n, r) => n + r.players.size, 0),
    buildTime: BUILD_TIME,
    database: 'postgresql',
    dbReady,
  });
});

app.get('/health/db', async (_req, res) => {
  try {
    const [userRow] = await sql`SELECT COUNT(*) as cnt FROM players` as any[];
    const [clanRow] = await sql`SELECT COUNT(*) as cnt FROM clans` as any[];
    const [matchRow] = await sql`SELECT COUNT(*) as cnt FROM game_history` as any[];
    const [achRow]  = await sql`SELECT COUNT(*) as cnt FROM player_achievements` as any[];
    const [convRow] = await sql`SELECT COUNT(*) as cnt FROM conversations` as any[];
    const [msgRow]  = await sql`SELECT COUNT(*) as cnt FROM direct_messages` as any[];
    res.json({
      ok: true,
      database: { connected: true, provider: 'postgresql' },
      counts: {
        users: Number(userRow.cnt), clans: Number(clanRow.cnt),
        matches: Number(matchRow.cnt), achievements: Number(achRow.cnt),
        conversations: Number(convRow.cnt), messages: Number(msgRow.cnt),
      },
    });
  } catch (e: any) {
    res.status(503).json({ ok: false, database: { connected: false, error: e.message } });
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

  // Hashed assets (index-abc123.js) can be cached for a year
  app.use(express.static(clientDist, {
    maxAge: '1y',
    immutable: true,
    setHeaders: (res, filePath) => {
      // index.html must never be cached so browsers always get the latest
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
const GAME_OVER_TTL  = 10 * 60 * 1000;  // 10 minutes
const EMPTY_ROOM_TTL =  5 * 60 * 1000;  //  5 minutes

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
}, 60_000); // check every minute

// ── Socket.IO ─────────────────────────────────────────────────────────
attachSocketHandlers(io);

// ── Start — listen immediately so Railway healthcheck passes ──────────
httpServer.listen(PORT, () => {
  console.log(`\n  VOID MAFIA server running on http://localhost:${PORT}`);
  console.log(`  Mode: ${IS_PROD ? 'production' : 'development'}\n`);
});

// Database initialises async after the server is already listening.
// Railway healthcheck hits /api/health and gets a response straight away.
initializeDatabase().then(() => {
  dbReady = true;
  console.log('[Startup] Database ready.');
}).catch(err => {
  console.error('[Startup] Database init failed:', err.message);
  // Delay exit by 8 s so Railway's healthcheck at /health can respond 200
  // at least once before the process dies and triggers a restart.
  // Without the delay, the process exits before the first healthcheck fires
  // and Railway marks the deployment as permanently failed.
  setTimeout(() => {
    console.error('[Startup] Exiting now for Railway restart.');
    process.exit(1);
  }, 8000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  httpServer.close(() => process.exit(0));
});

// Prevent crash on unhandled errors — log and continue
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
