const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ ok: true, app: 'Void Portal' });
});

const spaces = {
  lounge: 'Void Lounge',
  mafia: 'Mafia Lite',
  confession: 'Confession Room',
  truth: 'Truth or Dare',
  debate: 'Debate Arena',
  mystery: 'Mystery Room'
};

const rooms = new Map();
const socketState = new Map();

function makeRoomKey(space, roomCode) {
  return `${space}:${roomCode}`;
}

function sanitizeText(value, max = 120) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, max);
}

function getOrCreateRoom(space, roomCode) {
  const key = makeRoomKey(space, roomCode);
  if (!rooms.has(key)) {
    rooms.set(key, {
      key,
      space,
      roomCode,
      players: [],
      createdAt: Date.now(),
      gameState: {
        started: false,
        phase: 'lobby'
      },
      confessions: []
    });
  }
  return rooms.get(key);
}

function publicRoom(room) {
  return {
    key: room.key,
    space: room.space,
    spaceName: spaces[room.space] || room.space,
    roomCode: room.roomCode,
    players: room.players.map((player) => ({
      id: player.id,
      username: player.username,
      host: player.host
    })),
    playerCount: room.players.length,
    gameState: room.gameState
  };
}

function emitRoomUpdate(room) {
  io.to(room.key).emit('room-update', publicRoom(room));
}

function leaveCurrentRoom(socket) {
  const state = socketState.get(socket.id);
  if (!state) return;

  const room = rooms.get(state.roomKey);
  if (!room) {
    socketState.delete(socket.id);
    return;
  }

  const leavingPlayer = room.players.find((player) => player.id === socket.id);
  room.players = room.players.filter((player) => player.id !== socket.id);

  if (room.players.length > 0 && !room.players.some((player) => player.host)) {
    room.players[0].host = true;
  }

  socket.leave(room.key);
  socketState.delete(socket.id);

  if (leavingPlayer) {
    io.to(room.key).emit('system-message', {
      text: `${leavingPlayer.username} left the room.`,
      time: Date.now()
    });
  }

  if (room.players.length === 0) {
    rooms.delete(room.key);
  } else {
    emitRoomUpdate(room);
  }
}

io.on('connection', (socket) => {
  socket.emit('connected', { id: socket.id });

  socket.on('join-space', (payload = {}) => {
    const username = sanitizeText(payload.username, 24) || 'Guest';
    const roomCode = sanitizeText(payload.roomCode, 20) || 'VOID';
    const space = sanitizeText(payload.space, 30) || 'lounge';

    if (!spaces[space]) {
      socket.emit('error-message', { text: 'Unknown space selected.' });
      return;
    }

    leaveCurrentRoom(socket);

    const room = getOrCreateRoom(space, roomCode);
    const isHost = room.players.length === 0;

    room.players.push({
      id: socket.id,
      username,
      host: isHost,
      joinedAt: Date.now()
    });

    socket.join(room.key);
    socketState.set(socket.id, { roomKey: room.key, username, space, roomCode });

    socket.emit('joined-room', publicRoom(room));
    io.to(room.key).emit('system-message', {
      text: `${username} entered ${spaces[space]}.`,
      time: Date.now()
    });
    emitRoomUpdate(room);
  });

  socket.on('lobby-message', (payload = {}) => {
    const state = socketState.get(socket.id);
    if (!state) return;

    const text = sanitizeText(payload.text, 500);
    if (!text) return;

    io.to(state.roomKey).emit('lobby-message', {
      username: state.username,
      text,
      time: Date.now()
    });
  });

  socket.on('start-game', () => {
    const state = socketState.get(socket.id);
    if (!state) return;

    const room = rooms.get(state.roomKey);
    if (!room) return;

    const player = room.players.find((item) => item.id === socket.id);
    if (!player || !player.host) {
      socket.emit('error-message', { text: 'Only the room host can start the game.' });
      return;
    }

    room.gameState = {
      started: true,
      phase: state.space === 'mafia' ? 'role-preview' : 'started',
      startedAt: Date.now()
    };

    io.to(room.key).emit('game-started', publicRoom(room));
    emitRoomUpdate(room);
  });

  socket.on('truth-spin', () => {
    const state = socketState.get(socket.id);
    if (!state) return;

    const room = rooms.get(state.roomKey);
    if (!room || room.players.length === 0) return;

    const selected = room.players[Math.floor(Math.random() * room.players.length)];
    io.to(room.key).emit('truth-spin-result', {
      selected: selected.username,
      time: Date.now()
    });
  });

  socket.on('submit-confession', (payload = {}) => {
    const state = socketState.get(socket.id);
    if (!state) return;

    const room = rooms.get(state.roomKey);
    if (!room) return;

    const text = sanitizeText(payload.text, 600);
    if (!text) return;

    room.confessions.push({ text, author: state.username, time: Date.now() });
    socket.emit('confession-saved', { count: room.confessions.length });
    io.to(room.key).emit('system-message', {
      text: `A new anonymous confession was submitted. Total: ${room.confessions.length}`,
      time: Date.now()
    });
  });

  socket.on('reveal-confessions', () => {
    const state = socketState.get(socket.id);
    if (!state) return;

    const room = rooms.get(state.roomKey);
    if (!room) return;

    const player = room.players.find((item) => item.id === socket.id);
    if (!player || !player.host) {
      socket.emit('error-message', { text: 'Only the host can reveal confessions.' });
      return;
    }

    io.to(room.key).emit('confessions-revealed', {
      confessions: room.confessions.map((item, index) => ({
        number: index + 1,
        text: item.text
      }))
    });
  });

  socket.on('leave-room', () => {
    leaveCurrentRoom(socket);
    socket.emit('left-room');
  });

  socket.on('disconnect', () => {
    leaveCurrentRoom(socket);
  });
});

server.listen(PORT, () => {
  console.log(`VOID PORTAL is running on port ${PORT}`);
});
