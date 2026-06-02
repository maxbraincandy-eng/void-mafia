import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { attachSocketHandlers } from './socket.js';
import { getAllRooms, toRoomListItem, deleteRoom } from './services/roomService.js';
import { timerService } from './services/timerService.js';
import { getPlayer, toPublicProfile } from './services/playerService.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const CLIENT_URL = process.env.CLIENT_URL ?? 'http://localhost:5173';
const IS_PROD = process.env.NODE_ENV === 'production';
const app = express();
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
});
// ── Middleware ────────────────────────────────────────────────────────
app.use(cors({
    origin: IS_PROD ? false : CLIENT_URL,
    credentials: true,
}));
app.use(express.json());
// ── Health Check ──────────────────────────────────────────────────────
const BUILD_TIME = new Date().toISOString();
app.get('/api/health', (_req, res) => {
    const rooms = getAllRooms();
    res.json({
        ok: true,
        uptime: process.uptime(),
        rooms: rooms.length,
        players: rooms.reduce((n, r) => n + r.players.size, 0),
        buildTime: BUILD_TIME,
    });
});
// ── Rooms List ────────────────────────────────────────────────────────
app.get('/api/rooms', (_req, res) => {
    const list = getAllRooms()
        .filter(r => !r.settings.isPrivate && r.phase !== 'game_over')
        .map(toRoomListItem);
    res.json({ ok: true, data: list });
});
// ── Player Profile ────────────────────────────────────────────────────
app.get('/api/player/:id', (req, res) => {
    const profile = getPlayer(req.params.id);
    if (!profile) {
        res.status(404).json({ ok: false, error: 'Not found' });
        return;
    }
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
// Delete game_over rooms after 10 min, and lobby/game rooms with zero
// connected players after 5 min (handles abandoned rooms / server restarts).
const GAME_OVER_TTL = 10 * 60 * 1000; // 10 minutes
const EMPTY_ROOM_TTL = 5 * 60 * 1000; //  5 minutes
setInterval(() => {
    const now = Date.now();
    for (const room of getAllRooms()) {
        // Count connected (socket) players
        const connected = [...room.players.values()].filter(p => p.isConnected && p.socketId).length;
        if (room.phase === 'game_over') {
            // Use maxTimer=0 as a proxy for when game_over was set (timer is already 0 at game_over)
            // Instead track via room.createdAt vs now — just clean up after TTL since createdAt
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
            // Room has connected players — reset the empty timer
            delete room._emptyAt;
        }
    }
}, 60000); // check every minute
// ── Socket.IO ─────────────────────────────────────────────────────────
attachSocketHandlers(io);
// ── Start ─────────────────────────────────────────────────────────────
httpServer.listen(PORT, () => {
    console.log(`\n  VOID MAFIA server running on http://localhost:${PORT}`);
    console.log(`  Mode: ${IS_PROD ? 'production' : 'development'}\n`);
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
//# sourceMappingURL=index.js.map