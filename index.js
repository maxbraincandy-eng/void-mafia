// ══════════════════════════════════════════════════════════════════════════
//  V O I D  M A F I A  —  S E R V E R  C O R E  (v3.6 - STABLE INDEX & ROLES)
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
  
  // ოთახების სიის გაგზავნა
  socket.on('get-rooms', () => {
    socket.emit('update-room-list', Object.values(rooms));
  });

  // ოთახში შესვლა
  socket.on('join-room', (roomCode, playerName) => {
    if (!rooms[roomCode]) {
      rooms[roomCode] = { 
        code: roomCode, 
        playerCount: 0, 
        players: [], 
        hostId: socket.id 
      };
    }

    const room = rooms[roomCode];
    if (room.playerCount >= 10) {
      return socket.emit('error', { msg: 'ოთახი სავსეა' });
    }

    socket.join(roomCode);
    room.playerCount++;

    // ლოგიკური ნუმერაცია (პოულობს პირველ ცარიელ ადგილს)
    const occupiedIndices = room.players.map(p => p.index);
    let playerIndex = 1;
    while (occupiedIndices.includes(playerIndex)) {
      playerIndex++;
    }

    const newUser = { 
      id: socket.id, 
      name: playerName, 
      room: roomCode, 
      index: playerIndex 
    };

    users[socket.id] = newUser;
    room.players.push(newUser);

    // ჰოსტის სტატუსის მინიჭება (თუ პირველია ან ოთახი ცარიელი იყო)
    if (room.hostId === socket.id || room.players.length === 1) {
      room.hostId = socket.id;
      socket.emit('is-host');
    }

    // 1. ახალ მოთამაშეს ვუგზავნით ინფორმაციას უკვე მყოფებზე
    const otherUsers = room.players.filter(p => p.id !== socket.id);
    socket.emit('all-users-info', otherUsers);

    // 2. სხვებს ვატყობინებთ ახალი მოთამაშის შესახებ
    socket.to(roomCode).emit('user-joined-with-info', {
        id: socket.id,
        nick: playerName,
        index: playerIndex
    });

    // 3. საკუთარ თავს ვუდასტურებთ მონაცემებს
    socket.emit('room-users-list', room.players);

    // გლობალური სიის განახლება
    io.emit('update-room-list', Object.values(rooms));
    console.log(`[VOID] #${playerIndex} ${playerName} შეუერთდა ოთახს: ${roomCode}`);
  });

  // WebRTC სიგნალიზაცია (P2P კავშირისთვის)
  socket.on('sending-signal', payload => {
    const sender = users[socket.id];
    io.to(payload.userToSignal).emit('user-joined-with-info', {
      signal: payload.signal,
      id: socket.id,
      nick: sender ? sender.name : "Unknown",
      index: sender ? sender.index : 0
    });
  });

  socket.on('returning-signal', payload => {
    io.to(payload.callerID).emit('receiving-returned-signal', {
      signal: payload.signal,
      id: socket.id
    });
  });

  // თამაშის დაწყება და როლების გადანაწილება
  socket.on('start-game-request', (data) => {
    const room = rooms[data.room];
    if (!room || room.hostId !== socket.id) return;

    let players = [...room.players];
    let settings = data.settings;
    
    // როლების გენერაცია
    let roles = [];
    
    // მაფია
    let mCount = parseInt(settings.mafia) || 1;
    for(let i=0; i < mCount; i++) roles.push('mafia');
    
    // სპეციალური როლები
    if(settings.don) roles.push('don');
    if(settings.sheriff) roles.push('sheriff');
    if(settings.doctor) roles.push('doctor');
    
    // დარჩენილი ადგილები - მოქალაქეები
    while(roles.length < players.length) {
      roles.push('citizen');
    }

    // როლების არევა (Fisher-Yates Shuffle)
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }

    // როლების დარიგება თითოეულ მოთამაშეზე
    players.forEach((p, i) => {
      io.to(p.id).emit('assign-role', roles[i]);
    });

    io.to(data.room).emit('game-started');
    console.log(`[GAME] თამაში დაიწყო ოთახში: ${data.room} | როლები: ${roles.join(', ')}`);
  });

  // ჩატის მართვა
  socket.on('send-chat-msg', (data) => {
    if (data.room) {
      io.to(data.room).emit('receive-chat-msg', {
        name: data.name,
        text: data.text
      });
    }
  });

  // გათიშვა
  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      const roomCode = user.room;
      const room = rooms[roomCode];

      if (room) {
        // მოთამაშის ამოშლა ოთახიდან
        room.players = room.players.filter(p => p.id !== socket.id);
        room.playerCount--;

        socket.to(roomCode).emit('user-left', socket.id);

        // თუ ჰოსტი გავიდა, ახალი ჰოსტის დანიშვნა
        if (room.hostId === socket.id && room.players.length > 0) {
          room.hostId = room.players[0].id;
          io.to(room.hostId).emit('is-host');
        }

        // თუ ოთახი დაიცალა, წაშლა
        if (room.playerCount <= 0) {
          delete rooms[roomCode];
        }
      }
      delete users[socket.id];
      io.emit('update-room-list', Object.values(rooms));
      console.log(`[VOID] მომხმარებელი გაითიშა: ${socket.id}`);
    }
  });
});

// სერვერის გაშვება
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n\x1b[35m════════════════════════════════════════════════\x1b[0m`);
  console.log(`\x1b[36m > VOID_CORE_3.6: ACTIVE ON PORT ${PORT}\x1b[0m`);
  console.log(`\x1b[32m > LOCAL: http://localhost:${PORT}\x1b[0m`);
  console.log(`\x1b[35m════════════════════════════════════════════════\x1b[0m\n`);
});
