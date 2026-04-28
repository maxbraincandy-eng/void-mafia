// ══════════════════════════════════════════════════════════════════════════
//  V O I D  M A F I A  —  S E R V E R  C O R E  (v3.0 - Synthwave Edition)
// ══════════════════════════════════════════════════════════════════════════
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// ── In-Memory Database ──
const rooms = {};
const users = {};

io.on('connection', (socket) => {
  const signalPrefix = `[SIGNAL_${socket.id.substring(0, 4)}]`;
  console.log(`${signalPrefix} >> TRANSMISSION_STABILIZED`);

  // აქტიური ოთახების სიის გაგზავნა ახალ მოთამაშესთან
  socket.on('get-rooms', () => {
    const activeRooms = Object.values(rooms).filter(r => r.status === 'waiting');
    socket.emit('update-room-list', activeRooms);
  });

  // ოთახის შექმნა
  socket.on('join-room', (roomCode, playerName) => {
    // თუ ოთახი არ არსებობს, ვქმნით
    if (!rooms[roomCode]) {
      rooms[roomCode] = {
        code: roomCode,
        status: 'waiting',
        playerCount: 0
      };
      console.log(`${signalPrefix} >> NEW_VOID_CREATED: ${roomCode}`);
    }

    const room = rooms[roomCode];
    if (room.playerCount >= 10) {
      return socket.emit('error', { msg: 'VOID_CAPACITY_REACHED' });
    }

    socket.join(roomCode);
    room.playerCount++;
    users[socket.id] = { name: playerName, room: roomCode };

    // ყველა მოთამაშის ID, გარდა შემოსულისა, WebRTC კავშირისთვის
    const allUsersInRoom = Array.from(io.sockets.adapter.rooms.get(roomCode) || [])
      .filter(id => id !== socket.id);
    
    socket.emit('all-users', allUsersInRoom);
    
    // ოთახების სიის განახლება ყველასთან
    io.emit('update-room-list', Object.values(rooms).filter(r => r.status === 'waiting'));
    
    console.log(`${signalPrefix} >> OPERATOR_SYNCED: ${playerName} to VOID_${roomCode}`);
  });

  // ── WebRTC Signaling Logic ──
  socket.on('sending-signal', payload => {
    io.to(payload.userToSignal).emit('user-joined', {
      signal: payload.signal,
      callerID: payload.callerID
    });
  });

  socket.on('returning-signal', payload => {
    io.to(payload.callerID).emit('receiving-returned-signal', {
      signal: payload.signal,
      id: socket.id
    });
  });

  socket.on('disconnect', () => {
    console.log(`${signalPrefix} >> SIGNAL_LOST`);
    if (users[socket.id]) {
      const { name, room } = users[socket.id];
      socket.to(room).emit('user-left', socket.id);
      
      if (rooms[room]) {
        rooms[room].playerCount--;
        // თუ ოთახი ცარიელია, ვშლით
        if (rooms[room].playerCount === 0) {
          delete rooms[room];
          io.emit('update-room-list', Object.values(rooms).filter(r => r.status === 'waiting'));
        }
      }
      delete users[socket.id];
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
  \x1b[35m██╗   ██╗ ██████╗ ██╗██████╗     ███╗   ███╗ █████╗ ███████╗██╗ █████╗ 
  ██║   ██║██╔═══██╗██║██╔══██╗    ████╗ ████║██╔══██╗██╔════╝██║██╔══██╗
  ██║   ██║██║   ██║██║██║  ██║    ██╔████╔██║███████║█████╗  ██║███████║
  ╚██╗ ██╔╝██║   ██║██║██║  ██║    ██║╚██╔╝██║██╔══██║██╔══╝  ██║██╔══██║
   ╚████╔╝ ╚██████╔╝██║██████╔╝    ██║ ╚═╝ ██║██║  ██║██║     ██║██║  ██║\x1b[0m

  \x1b[36m > ENGINE: VOID_CORE_3.0 [ONLINE]
  \x1b[36m > Port: ${PORT}
  \x1b[35m > STATUS: SCANNING_FOR_SIGNALS... \x1b[0m
  `);
});
