// ══════════════════════════════════════════════════════════════════════════
//  V O I D  M A F I A  —  S E R V E R  C O R E  (v2.5)
// ══════════════════════════════════════════════════════════════════════════
const express    = require('express');
const http       = require('http');
const socketIO   = require('socket.io');
const mongoose   = require('mongoose');
const path       = require('path');
const jwt        = require('jsonwebtoken');
require('dotenv').config();

const app    = express();
const server = http.createServer(app);
const io     = socketIO(server, {
  cors: { origin: '*', methods: ['GET','POST'] }
});

const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'void_secret_2026';

// ── MONGODB CONNECTION (შენი კავშირის სტრინგი) ──
const MONGO_URI = "mongodb+srv://maxbraincandy_db_user:C8yIfHgHiNCCukBw@cluster0.enaxpdp.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ [SYSTEM] >> PERSISTENCE_LAYER_CONNECTED (MongoDB)'))
  .catch(err => console.error('❌ [SYSTEM] >> DATABASE_OFFLINE:', err.message));

// ── MIDDLEWARE ──
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── SOCKET.IO AUTHENTICATION ──
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  
  // თუ ტესტირებისას ტოკენი არ გაქვს, მაინც შეუშვი როგორც ოპერატორი
  if (!token) {
    socket.user = { 
      username: "Operator_" + socket.id.substring(0,4),
      role: 'guest'
    };
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    // მხოლოდ არასწორი ტოკენის შემთხვევაში იბლოკება
    next(new Error('AUTHENTICATION_FAILED'));
  }
});

// ── VOID ENGINE LOGIC ──
const rooms = {};

io.on('connection', (socket) => {
  console.log(`🔌 [SIGNAL] >> SYNC_ESTABLISHED: ${socket.user.username}`);

  // ოთახის შექმნა
  socket.on('create_room', ({ roomCode, playerName }) => {
    rooms[roomCode] = {
      code: roomCode,
      players: [{ id: socket.id, name: playerName, isAdmin: true, isAlive: true, role: null }],
      status: 'waiting',
      created_at: Date.now()
    };
    socket.join(roomCode);
    io.to(roomCode).emit('room_update', rooms[roomCode]);
    console.log(`🏠 [VOID] >> ROOM_STABILIZED: ${roomCode}`);
  });

  // ოთახში შეერთება
  socket.on('join_room', ({ roomCode, playerName }) => {
    const room = rooms[roomCode];
    if (!room) return socket.emit('error', { msg: 'FREQUENCY_NOT_FOUND' });
    
    room.players.push({ id: socket.id, name: playerName, isAdmin: false, isAlive: true, role: null });
    socket.join(roomCode);
    io.to(roomCode).emit('room_update', room);
  });

  socket.on('disconnect', () => {
    Object.keys(rooms).forEach(code => {
      const room = rooms[code];
      const idx = room.players?.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        io.to(code).emit('room_update', room);
        if (room.players.length === 0) delete rooms[code];
      }
    });
    console.log(`🔌 [SIGNAL] >> LOST_CONNECTION: ${socket.id}`);
  });
});

// ── SERVER BOOT ──
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  \x1b[35m  ██╗   ██╗ ██████╗ ██╗██████╗     ███╗   ███╗ █████╗ ███████╗██╗ █████╗ 
    ██║   ██║██╔═══██╗██║██╔══██╗    ████╗ ████║██╔══██╗██╔════╝██║██╔══██╗
    ██║   ██║██║   ██║██║██║  ██║    ██╔████╔██║███████║█████╗  ██║███████║
    ╚██╗ ██╔╝██║   ██║██║██║  ██║    ██║╚██╔╝██║██╔══██║██╔══╝  ██║██╔══██║
     ╚████╔╝ ╚██████╔╝██║██████╔╝    ██║ ╚═╝ ██║██║  ██║██║     ██║██║  ██║\x1b[0m
  
  \x1b[36m > VOID MAFIA ENGINE ONLINE
  \x1b[36m > PORT: ${PORT}
  \x1b[35m > MONGODB: CONNECTED\x1b[0m
  `);
});

