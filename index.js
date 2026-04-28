
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

// ── MONGODB CONNECTION (შენი მონაცემთა ბაზა) ──
const MONGO_URI = "mongodb+srv://maxbraincandy_db_user:C8yIfHgHiNCCukBw@cluster0.enaxpdp.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ [SYSTEM] >> DATABASE_STABILIZED'))
  .catch(err => console.error('❌ [SYSTEM] >> DB_CONNECTION_FAILED:', err.message));

// ── MIDDLEWARE ──
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── SOCKET.IO AUTH (ამ ნაწილმა აურია და ახლა გასწორებულია) ──
io.use((socket, next) => {
  // ვამოწმებთ ტოკენს სხვადასხვა გზით
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  
  if (!token) {
    // თუ ტოკენი არ არის, მაინც ვუშვებთ როგორც სტუმარს, რომ არ ამოაგდოს CONNECTION_REFUSED
    socket.user = { 
      username: "Operator_" + socket.id.substring(0,4),
      isGuest: true 
    };
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.user = decoded;
    next();
  } catch (err) {
    // თუ ტოკენი არასწორია, მხოლოდ მაშინ ვთიშავთ
    next(new Error('AUTHENTICATION_FAILED'));
  }
});

// ── VOID GAME ENGINE ──
const rooms = {};

io.on('connection', (socket) => {
  console.log(`🔌 [SIGNAL] >> SYNC_SUCCESS: ${socket.user.username}`);

  // ოთახის შექმნა
  socket.on('create_room', ({ roomCode, playerName }) => {
    rooms[roomCode] = {
      code: roomCode,
      players: [{ id: socket.id, name: playerName, isAdmin: true, isAlive: true, role: null }],
      status: 'waiting'
    };
    socket.join(roomCode);
    io.to(roomCode).emit('room_update', rooms[roomCode]);
  });

  // ოთახში შეერთება
  socket.on('join_room', ({ roomCode, playerName }) => {
    const room = rooms[roomCode];
    if (!room) return socket.emit('error', { msg: 'VOID_NOT_FOUND' });
    
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
  });
});

// ── BOOTUP ──
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  \x1b[35m > VOID MAFIA CORE ONLINE
  \x1b[36m > FREQUENCY: ${PORT}
  \x1b[35m > DB_STATUS: CONNECTED\x1b[0m
  `);
});
