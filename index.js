// ════════════════════════════════════════
//  VOID MAFIA — index.js (Render-ready)
// ════════════════════════════════════════
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

// ── PORT — Render ავტომატურად მოგცემს process.env.PORT ──
const PORT = process.env.PORT || 3000;

// ── MIDDLEWARE ──
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ── MONGODB ──
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

if (MONGO_URI) {
  mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB connected'))
    .catch(err => {
      console.error('❌ MongoDB error:', err.message);
      // არ გაჩერდეს — გააგრძელოს სერვისი
    });
} else {
  console.warn('⚠️  MONGO_URI not set — running without DB');
}

// ── ROUTES ──
// სტატიკური ფაილები public/ საქაღალდიდან
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API health check — Render-ი ამას ამოწმებს
app.get('/health', (req, res) => {
  res.json({ status: 'OK', game: 'VOID MAFIA', time: new Date() });
});

// Route ფაილები (თუ გაქვს)
try {
  const gameRoutes = require('./routes/game');
  app.use('/api/game', gameRoutes);
} catch(e) { console.log('routes/game not found, skipping'); }

try {
  const authRoutes = require('./routes/auth');
  app.use('/api/auth', authRoutes);
} catch(e) { console.log('routes/auth not found, skipping'); }

// ── SOCKET.IO ──
const rooms = {}; // მარტივი in-memory rooms

io.on('connection', (socket) => {
  console.log('🔌 Player connected:', socket.id);

  // ოთახის შექმნა
  socket.on('create_room', ({ roomCode, playerName }) => {
    rooms[roomCode] = {
      code: roomCode,
      players: [{ id: socket.id, name: playerName, isAdmin: true, isAlive: true, role: null }],
      status: 'waiting',
      phase: 0
    };
    socket.join(roomCode);
    socket.emit('room_created', { code: roomCode });
    io.to(roomCode).emit('room_update', rooms[roomCode]);
    console.log(`🏠 Room created: ${roomCode} by ${playerName}`);
  });

  // ოთახში შეერთება
  socket.on('join_room', ({ roomCode, playerName }) => {
    const room = rooms[roomCode];
    if (!room) { socket.emit('error', { msg: 'Room not found' }); return; }
    if (room.status !== 'waiting') { socket.emit('error', { msg: 'Game already started' }); return; }
    if (room.players.length >= 12) { socket.emit('error', { msg: 'Room is full' }); return; }

    // უკვე შემოვიდა?
    const exists = room.players.find(p => p.id === socket.id);
    if (!exists) {
      room.players.push({ id: socket.id, name: playerName, isAdmin: false, isAlive: true, role: null });
    }
    socket.join(roomCode);
    socket.emit('room_joined', { code: roomCode });
    io.to(roomCode).emit('room_update', room);
    console.log(`👤 ${playerName} joined room: ${roomCode}`);
  });

  // თამაშის დაწყება (admin)
  socket.on('start_game', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player?.isAdmin) { socket.emit('error', { msg: 'Not admin' }); return; }
    if (room.players.length < 4) { socket.emit('error', { msg: 'Need at least 4 players' }); return; }

    // როლების დარიგება
    room.players = assignRoles(room.players);
    room.status = 'role_reveal';
    room.phase = 1;

    // ყოველ მოთამაშეს გაუგზავნე მხოლოდ საკუთარი როლი
    room.players.forEach(p => {
      io.to(p.id).emit('your_role', { role: p.role });
    });

    io.to(roomCode).emit('phase_change', { phase: 'role_reveal', phaseNum: 1 });
    console.log(`▶️  Game started in room: ${roomCode}`);
  });

  // ხმის მიცემა
  socket.on('cast_vote', ({ roomCode, targetId }) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (!room.votes) room.votes = {};
    room.votes[socket.id] = targetId;
    io.to(roomCode).emit('vote_update', { votes: countVotes(room.votes, room.players) });
  });

  // ღამის ქმედება
  socket.on('night_action', ({ roomCode, action, targetId }) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (!room.nightActions) room.nightActions = {};
    room.nightActions[socket.id] = { action, targetId };
    socket.emit('action_received', { action });
  });

  // chat
  socket.on('chat_message', ({ roomCode, message, playerName }) => {
    io.to(roomCode).emit('new_message', {
      from: playerName,
      text: message,
      time: new Date().toISOString()
    });
  });

  // disconnect
  socket.on('disconnect', () => {
    console.log('🔌 Player disconnected:', socket.id);
    // ყველა ოთახიდან ამოიღე
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

// ── HELPERS ──
function assignRoles(players) {
  const count = players.length;
  let roles = [];

  if (count <= 6)       roles = ['mafia','detective','doctor',...Array(count-3).fill('civilian')];
  else if (count <= 8)  roles = ['mafia','mafia','detective','doctor',...Array(count-4).fill('civilian')];
  else if (count <= 10) roles = ['mafia','mafia','godfather','detective','doctor',...Array(count-5).fill('civilian')];
  else                  roles = ['mafia','mafia','mafia','godfather','detective','doctor',...Array(count-6).fill('civilian')];

  // shuffle
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }

  return players.map((p, i) => ({ ...p, role: roles[i] }));
}

function countVotes(votes, players) {
  const counts = {};
  Object.values(votes).forEach(targetId => {
    const p = players.find(pl => pl.id === targetId);
    if (!p) return;
    if (!counts[targetId]) counts[targetId] = { name: p.name, count: 0 };
    counts[targetId].count++;
  });
  return Object.entries(counts)
    .map(([id, v]) => ({ id, name: v.name, count: v.count }))
    .sort((a, b) => b.count - a.count);
}

// ── START SERVER ──
server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ██╗   ██╗ ██████╗ ██╗██████╗     ███╗   ███╗ █████╗ ███████╗██╗ █████╗ 
  ██║   ██║██╔═══██╗██║██╔══██╗    ████╗ ████║██╔══██╗██╔════╝██║██╔══██╗
  ██║   ██║██║   ██║██║██║  ██║    ██╔████╔██║███████║█████╗  ██║███████║
  ╚██╗ ██╔╝██║   ██║██║██║  ██║    ██║╚██╔╝██║██╔══██║██╔══╝  ██║██╔══██║
   ╚████╔╝ ╚██████╔╝██║██████╔╝    ██║ ╚═╝ ██║██║  ██║██║     ██║██║  ██║
    ╚═══╝   ╚═════╝ ╚═╝╚═════╝     ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝
  
  🎭 VOID MAFIA SERVER ONLINE
  🌐 Port: ${PORT}
  🕐 ${new Date().toISOString()}
  `);
});

module.exports = { app, server, io };
