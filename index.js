// ══════════════════════════════════════════════════════════════════════════
//  V O I D  M A F I A  —  N E O N  S E R V E R  (v2.0 - Synthwave Edition)
// ══════════════════════════════════════════════════════════════════════════
const express    = require('express');
const http       = require('http');
const socketIO   = require('socket.io');
const mongoose   = require('mongoose');
const path       = require('path');
require('dotenv').config();

const app    = express();
const server = http.createServer(app);
const io     = socketIO(server, {
  cors: { origin: '*', methods: ['GET','POST'] }
});

const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ──
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── MONGODB (VOID PERSISTENCE) ──
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(() => console.log(' [SYSTEM] >> PERSISTENCE_LAYER_CONNECTED (MongoDB)'))
    .catch(err => console.error(' [SYSTEM] >> PERSISTENCE_ERROR:', err.message));
}

// ── ROUTES ──
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OPERATIONAL', 
    engine: 'VOID_CORE_3.0', 
    timestamp: new Date().toISOString() 
  });
});

// ── VOID GAME ENGINE (In-Memory Rooms) ──
const rooms = {};

io.on('connection', (socket) => {
  const logPrefix = `[SIGNAL_ID: ${socket.id.substring(0, 6)}]`;
  console.log(`${logPrefix} >> INCOMING_CONNECTION_ESTABLISHED`);

  // ოთახის ინიციალიზაცია (Void Initialization)
  socket.on('create_room', ({ roomCode, playerName }) => {
    rooms[roomCode] = {
      code: roomCode,
      players: [{ 
        id: socket.id, 
        name: playerName, 
        isAdmin: true, 
        isAlive: true, 
        role: null,
        connection_time: Date.now()
      }],
      status: 'waiting',
      phase: 'INITIAL_BOOT',
      history: []
    };
    socket.join(roomCode);
    socket.emit('room_created', { code: roomCode });
    io.to(roomCode).emit('room_update', rooms[roomCode]);
    console.log(`${logPrefix} >> VOID_ROOM_STABILIZED: ${roomCode}`);
  });

  // შეერთება (Frequency Sync)
  socket.on('join_room', ({ roomCode, playerName }) => {
    const room = rooms[roomCode];
    if (!room) return socket.emit('error', { msg: 'FREQUENCY_NOT_FOUND' });
    if (room.status !== 'waiting') return socket.emit('error', { msg: 'TRANSMISSION_ALREADY_IN_PROGRESS' });
    if (room.players.length >= 12) return socket.emit('error', { msg: 'VOID_CAPACITY_REACHED' });

    const exists = room.players.find(p => p.id === socket.id);
    if (!exists) {
      room.players.push({ 
        id: socket.id, 
        name: playerName, 
        isAdmin: false, 
        isAlive: true, 
        role: null 
      });
    }
    socket.join(roomCode);
    socket.emit('room_joined', { code: roomCode });
    io.to(roomCode).emit('room_update', room);
    console.log(`${logPrefix} >> NEW_OPERATOR_SYNCED: ${playerName} in ${roomCode}`);
  });

  // თამაშის დაწყება (Execution Start)
  socket.on('start_game', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;
    
    const adminPlayer = room.players.find(p => p.id === socket.id);
    if (!adminPlayer?.isAdmin) return socket.emit('error', { msg: 'UNAUTHORIZED_ACCESS' });
    if (room.players.length < 4) return socket.emit('error', { msg: 'INSUFFICIENT_DATA_POINTS (Min 4 players)' });

    // როლების დარიგება
    room.players = assignRoles(room.players);
    room.status = 'active';
    room.phase = 'ROLE_DISTRIBUTION';

    room.players.forEach(p => {
      io.to(p.id).emit('your_role', { 
        role: p.role,
        briefing: `[ENCRYPTED_DATA]: You are ${p.role.toUpperCase()}`
      });
    });

    io.to(roomCode).emit('phase_change', { 
      phase: 'NIGHT_ZERO', 
      msg: 'SYSTEM_ERROR: LIGHT_SOURCE_NOT_FOUND. ENTERING_THE_VOID.' 
    });
    console.log(`[CORE] >> GAME_EXECUTED_IN_ROOM: ${roomCode}`);
  });

  // ჩეთი (Terminal Logs)
  socket.on('chat_message', ({ roomCode, message, playerName }) => {
    io.to(roomCode).emit('new_message', {
      from: playerName,
      text: message,
      style: 'neon-cyan', // ფრონტენდზე გამოსაყენებლად
      time: new Date().toLocaleTimeString()
    });
  });

  // კავშირის გაწყვეტა (Signal Lost)
  socket.on('disconnect', () => {
    Object.keys(rooms).forEach(code => {
      const room = rooms[code];
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        const pName = room.players[idx].name;
        room.players.splice(idx, 1);
        io.to(code).emit('room_update', room);
        console.log(`${logPrefix} >> SIGNAL_LOST: ${pName} has left the Void.`);
        if (room.players.length === 0) {
          delete rooms[code];
          console.log(`[CORE] >> ROOM_DELETED: ${code} (No operators remaining)`);
        }
      }
    });
  });
});

// ── NEON HELPERS ──
function assignRoles(players) {
  const count = players.length;
  let roles = [];

  // Void Mafia Logic
  if (count <= 6)       roles = ['mafia','detective','doctor',...Array(count-3).fill('civilian')];
  else if (count <= 8)  roles = ['mafia','mafia','detective','doctor',...Array(count-4).fill('civilian')];
  else if (count <= 10) roles = ['mafia','mafia','godfather','detective','doctor',...Array(count-5).fill('civilian')];
  else                  roles = ['mafia','mafia','mafia','godfather','detective','doctor',...Array(count-6).fill('civilian')];

  // Neon Shuffle (Fisher-Yates)
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }

  return players.map((p, i) => ({ ...p, role: roles[i] }));
}

// ── BOOTUP SEQUENCE ──
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  \x1b[35m  ██╗   ██╗ ██████╗ ██╗██████╗     ███╗   ███╗ █████╗ ███████╗██╗ █████╗ 
    ██║   ██║██╔═══██╗██║██╔══██╗    ████╗ ████║██╔══██╗██╔════╝██║██╔══██╗
    ██║   ██║██║   ██║██║██║  ██║    ██╔████╔██║███████║█████╗  ██║███████║
    ╚██╗ ██╔╝██║   ██║██║██║  ██║    ██║╚██╔╝██║██╔══██║██╔══╝  ██║██╔══██║
     ╚████╔╝ ╚██████╔╝██║██████╔╝    ██║ ╚═╝ ██║██║  ██║██║     ██║██║  ██║
      ╚═══╝   ╚═════╝ ╚═╝╚═════╝     ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝\x1b[0m
  
  \x1b[36m > ENGINE: VOID_CORE_PROTCOL_ACTIVE
  \x1b[36m > FREQUENCY: ${PORT}
  \x1b[35m > STATUS: SCANNING_FOR_OPERATORS...\x1b[0m
  `);
});

module.exports = { app, server, io };
