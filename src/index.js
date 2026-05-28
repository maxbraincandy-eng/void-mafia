require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const helmet = require('helmet');
const { Server } = require('socket.io');
const { connectDatabase } = require('./db');
const { createEngine } = require('./gameEngine');
const { attachSocketServer } = require('./socket');
const { createAuthRouter } = require('./routes/auth');
const { createApiRouter } = require('./routes/api');

const PORT = process.env.PORT || 3000;

async function main() {
  const db = await connectDatabase();
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: true, credentials: true }, pingTimeout: 25000, pingInterval: 10000, maxHttpBufferSize: 1e6 });

  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'void_mafia_v20_dev_secret_change_me',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 30 }
  };
  if (db.enabled && process.env.MONGODB_URI) sessionConfig.store = MongoStore.create({ mongoUrl: process.env.MONGODB_URI, ttl: 60 * 60 * 24 * 30 });
  app.use(session(sessionConfig));

  app.use((req, res, next) => { if (['/', '.html', '.js', '.css'].some(x => req.path === x || req.path.endsWith(x))) res.setHeader('Cache-Control', 'no-store'); next(); });
  app.use(express.static(path.join(__dirname, '..', 'public'), { etag: false, maxAge: 0 }));

  const ctx = { io, db, rooms: new Map(), onlineUsers: new Map(), socketRooms: new Map(), security: { adminIds: String(process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean), monitorIds: String(process.env.MONITOR_IDS || '').split(',').map(s => s.trim()).filter(Boolean) }, webrtc: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] } };
  ctx.engine = createEngine(ctx);

  app.use('/api/auth', createAuthRouter(ctx));
  app.use('/api', createApiRouter(ctx));
  attachSocketServer(io, ctx);

  app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
  server.listen(PORT, () => console.log(`VOID MAFIA v20 Engine running on ${PORT}; MongoDB: ${db.enabled ? 'enabled' : 'memory fallback'}`));
}
main().catch(err => { console.error('BOOT FAILED:', err); process.exit(1); });
