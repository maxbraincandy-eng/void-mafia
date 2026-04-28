// ══════════════════════════════════════════════════════════════════════════
//  V O I D  M A F I A  —  S E R V E R  C O R E  (v3.2 - Chat Integrated)
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

// ── მონაცემთა ბაზა ოპერატიულ მეხსიერებაში ──
const rooms = {};
const users = {};

io.on('connection', (socket) => {
  const signalPrefix = `[SIGNAL_${socket.id.substring(0, 4)}]`;
  console.log(`${signalPrefix} >> კავშირი დამყარებულია`);

  // ოთახების სიის გაგზავნა
  socket.on('get-rooms', () => {
    socket.emit('update-room-list', Object.values(rooms));
  });

  // ოთახში შესვლა / შექმნა
  socket.on('join-room', (roomCode, playerName) => {
    if (!rooms[roomCode]) {
      rooms[roomCode] = {
        code: roomCode,
        playerCount: 0
      };
      console.log(`${signalPrefix} >> ახალი სიცარიელე შეიქმნა: ${roomCode}`);
    }

    const room = rooms[roomCode];
    if (room.playerCount >= 10) {
      return socket.emit('error', { msg: 'ოთახი სავსეა' });
    }

    socket.join(roomCode);
    room.playerCount++;
    users[socket.id] = { name: playerName, room: roomCode };

    const otherUsers = Array.from(io.sockets.adapter.rooms.get(roomCode) || [])
      .filter(id => id !== socket.id);
    
    socket.emit('all-users', otherUsers);
    io.emit('update-room-list', Object.values(rooms));
    
    console.log(`${signalPrefix} >> ოპერატორი სინქრონიზებულია: ${playerName} -> ${roomCode}`);
  });

  // ── ჩატის სისტემა (ახალი) ──
  socket.on('send-chat-msg', (data) => {
    // შეტყობინების გადაგზავნა ყველასთან ვინც ამავე ოთახშია
    if (data.room) {
      io.to(data.room).emit('receive-chat-msg', {
        name: data.name,
        text: data.text
      });
      console.log(`${signalPrefix} >> [CHAT] ${data.name}: ${data.text}`);
    }
  });

  // ── WebRTC სიგნალიზაცია ──
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
    console.log(`${signalPrefix} >> სიგნალი დაიკარგა`);
    if (users[socket.id]) {
      const { room } = users[socket.id];
      socket.to(room).emit('user-left', socket.id);
      
      if (rooms[room]) {
        rooms[room].playerCount--;
        if (rooms[room].playerCount <= 0) {
          delete rooms[room];
        }
        io.emit('update-room-list', Object.values(rooms));
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

  \x1b[36m > ძრავი: VOID_CORE_3.2 [ჩათი დამატებულია]
  \x1b[36m > პორტი: ${PORT}
  \x1b[35m > სტატუსი: სიგნალების ძიება... \x1b[0m
  `);
});
