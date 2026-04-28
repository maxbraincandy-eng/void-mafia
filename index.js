
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ──
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── MONGODB ──
const MONGO_URI = "mongodb+srv://maxbraincandy_db_user:C8yIfHgHiNCCukBw@cluster0.enaxpdp.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ DATABASE_STABILIZED'))
  .catch(err => console.log('❌ DB_OFFLINE:', err.message));

// ── ROUTES ──
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ONLINE', core: 'VOID_MAFIA_3.0' });
});

// ── SOCKET.IO ──
const rooms = {};

io.on('connection', (socket) => {
  console.log('🔌 NEW_SIGNAL:', socket.id);

  socket.on('create_room', ({ roomCode, playerName }) => {
    rooms[roomCode] = {
      code: roomCode,
      players: [{ id: socket.id, name: playerName, isAdmin: true, isAlive: true, role: null }],
      status: 'waiting'
    };
    socket.join(roomCode);
    io.to(roomCode).emit('room_update', rooms[roomCode]);
  });

  socket.on('join_room', ({ roomCode, playerName }) => {
    const room = rooms[roomCode];
    if (room) {
      room.players.push({ id: socket.id, name: playerName, isAdmin: false, isAlive: true, role: null });
      socket.join(roomCode);
      io.to(roomCode).emit('room_update', room);
    }
  });

  socket.on('disconnect', () => {
    Object.keys(rooms).forEach(code => {
      const room = rooms[code];
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        io.to(code).emit('room_update', room);
        if (room.players.length === 0) delete rooms[code];
      }
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 VOID_MAFIA_READY_ON_PORT_${PORT}`);
});
