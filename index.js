// ══════════════════════════════════════════════════════════════════════════
//  V O I D  M A F I A  —  S E R V E R  C O R E  (v3.3 - FIXED SYNC)
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

const rooms = {};
const users = {};

io.on('connection', (socket) => {
  const signalPrefix = `[SIGNAL_${socket.id.substring(0, 4)}]`;

  socket.on('get-rooms', () => {
    socket.emit('update-room-list', Object.values(rooms));
  });

  socket.on('join-room', (roomCode, playerName) => {
    if (!rooms[roomCode]) {
      rooms[roomCode] = { code: roomCode, playerCount: 0 };
    }

    const room = rooms[roomCode];
    if (room.playerCount >= 10) {
      return socket.emit('error', { msg: 'ოთახი სავსეა' });
    }

    socket.join(roomCode);
    room.playerCount++;
    
    // ვინახავთ მომხმარებელს ნიქნეიმთან ერთად
    users[socket.id] = { id: socket.id, name: playerName, room: roomCode };

    // ვიღებთ ოთახში მყოფი სხვა იუზერების სრულ ინფორმაციას (ID + Name)
    const otherUsersInRoom = Array.from(io.sockets.adapter.rooms.get(roomCode) || [])
      .filter(id => id !== socket.id)
      .map(id => ({
          id: id,
          nick: users[id] ? users[id].name : "Unknown"
      }));
    
    // ვუგზავნით ახალ შესულს სხვების სიას
    socket.emit('all-users', otherUsersInRoom);
    
    io.emit('update-room-list', Object.values(rooms));
    console.log(`${signalPrefix} >> ოპერატორი სინქრონიზებულია: ${playerName}`);
  });

  // WebRTC სიგნალიზაცია ნიქნეიმების მხარდაჭერით
  socket.on('sending-signal', payload => {
    io.to(payload.userToSignal).emit('user-joined', {
      signal: payload.signal,
      callerID: payload.callerID,
      callerNick: users[socket.id] ? users[socket.id].name : "OPERATOR" // ვამატებთ ნიკს
    });
  });

  socket.on('returning-signal', payload => {
    io.to(payload.callerID).emit('receiving-returned-signal', {
      signal: payload.signal,
      id: socket.id
    });
  });

  socket.on('send-chat-msg', (data) => {
    if (data.room) {
      io.to(data.room).emit('receive-chat-msg', {
        name: data.name,
        text: data.text
      });
    }
  });

  socket.on('disconnect', () => {
    if (users[socket.id]) {
      const { room } = users[socket.id];
      socket.to(room).emit('user-left', socket.id);
      
      if (rooms[room]) {
        rooms[room].playerCount--;
        if (rooms[room].playerCount <= 0) delete rooms[room];
        io.emit('update-room-list', Object.values(rooms));
      }
      delete users[socket.id];
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\x1b[36m > VOID_CORE_3.3: აქტიურია პორტზე ${PORT}\x1b[0m`);
});

