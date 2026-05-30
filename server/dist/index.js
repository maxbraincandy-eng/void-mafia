import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { attachSocketHandlers } from './socket.js';
import { getAllRooms } from './services/roomService.js';
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
    pingTimeout: 30000,
    pingInterval: 10000,
});
// ── Middleware ────────────────────────────────────────────────────────
app.use(cors({
    origin: IS_PROD ? false : CLIENT_URL,
    credentials: true,
}));
app.use(express.json());
// ── Health Check ──────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
    const rooms = getAllRooms();
    res.json({
        ok: true,
        uptime: process.uptime(),
        rooms: rooms.length,
        players: rooms.reduce((n, r) => n + r.players.size, 0),
    });
});
// ── Serve built client in production ─────────────────────────────────
if (IS_PROD) {
    const clientDist = path.resolve(__dirname, '../../client/dist');
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => {
        res.sendFile(path.join(clientDist, 'index.html'));
    });
}
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
//# sourceMappingURL=index.js.map