// ══════════════════════════════════════════════════════════════════════════
//  V O I D  M A F I A  —  S E R V E R  C O R E  (v3.5 - INDEXED & ROLES)
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
  
  socket.on('get-rooms', () => {
    socket.emit('update-room-list', Object.values(rooms));
  });

  socket.on('join-room', (roomCode, playerName) => {
    if (!rooms[roomCode]) {
      // თუ ოთახი არ არსებობს, ვქმნით და ვნიშნავთ ჰოსტს
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

    // ნუმერაციის ლოგიკა: ვპოულობთ პირველ თავისუფალ ნომერს 1-დან 10-მდე
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

    // თუ ეს მომხმარებელი პირველია, ვაძლევთ ჰოსტის უფლებას
    if (room.hostId === socket.id) {
      socket.emit('is-host');
    }

    // ვუგზავნით ახალ შემოსულს ინფორმაციას ოთახში უკვე მყოფებზე (ID, ნიკი, ნომერი)
    const otherUsers = room.players.filter(p => p.id !== socket.id);
    socket.emit('all-users-info', otherUsers);

    // ყველას ვუგზავნით ინფორმაციას ახალ მოთამაშეზე
    socket.to(roomCode).emit('user-joined-with-info', {
        id: socket.id,
        nick: playerName,
        index: playerIndex
    });

    // სინქრონიზაცია კლიენტთან
    socket.emit('room-users-list', room.players);

    io.emit('update-room-list', Object.values(rooms));
    console.log(`[VOID] მოთამაშე #${playerIndex} შეუერთდა: ${playerName}`);
  });

  // WebRTC სიგნალიზაცია
  socket.on('sending-signal', payload => {
    const sender = users[socket.id];
    io.to(payload.userToSignal).emit('user-joined-with-info', {
      signal: payload.signal,
      id: payload.callerID,
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

  // თამაშის დაწყება და როლების დარიგება
  socket.on('start-game-request', (data) => {
    const room = rooms[data.room];
    if (!room || room.hostId !== socket.id) return;

    let players = [...room.players];
    let settings = data.settings;
    
    // როლების მასივი
    let roles = [];
    for(let i=0; i<settings.mafia; i++) roles.push('mafia');
    if(settings.don) roles.push('don');
    if(settings.sheriff) roles.push('sheriff');
    if(settings.doctor) roles.push('doctor'); // ექიმის დამატება
    
    while(roles.length < players.length) {
      roles.push('citizen');
    }

    // არევა (Shuffle)
    roles = roles.sort(() => Math.random() - 0.5);

    // დარიგება
    players.forEach((p, i) => {
      io.to(p.id).emit('assign-role', roles[i]);
    });

    io.to(data.room).emit('game-started');
    console.log(`[GAME] თამაში დაიწყო ოთახში: ${data.room}`);
  });

  socket.on('send-chat-msg', (data) => {
    io.to(data.room).emit('receive-chat-msg', {
      name: data.name,
      text: data.text
    });
  });

  socket.on('disconnect', () => {
    const user = users[socket.id];
    if (user) {
      const roomCode = user.room;
      const room = rooms[roomCode];

      if (room) {
        room.players = room.players.filter(p => p.id !== socket.id);
        room.playerCount--;

        socket.to(roomCode).emit('user-left', socket.id);

        // თუ ჰოსტი გავიდა, გადავცეთ სხვა მოთამაშეს
        if (room.hostId === socket.id && room.players.length > 0) {
          room.hostId = room.players[0].id;
          io.to(room.hostId).emit('is-host');
        }

        if (room.playerCount <= 0) {
          delete rooms[roomCode];
        }
      }
      delete users[socket.id];
      io.emit('update-room-list', Object.values(rooms));
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\x1b[36m > VOID_CORE_3.5: აქტიურია პორტზე ${PORT}\x1b[0m`);
});

