const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { 
        origin: "*",
        methods: ["GET", "POST"]
    } 
});

// "public" ფოლდერის დაკავშირება ინტერფეისისთვის
app.use(express.static(path.join(__dirname, 'public')));

// ბაზის მისამართს ვიღებთ Render-ის Environment Variable-დან
const mongoURI = process.env.MONGO_URI; 

mongoose.connect(mongoURI)
  .then(() => console.log('MongoDB Connected Successfully!'))
  .catch(err => console.error('Database Connection Error:', err));

// ოთახების მონაცემების დროებითი საცავი
const rooms = {};

io.on('connection', (socket) => {
  console.log('ახალი კავშირი:', socket.id);

  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId);
    
    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }
    rooms[roomId].push(socket.id);

    console.log(`მომხმარებელი ${userId} შევიდა ოთახში: ${roomId}`);

    // ვატყობინებთ სხვებს ოთახში, რომ ახალი მოთამაშე შემოვიდა
    socket.to(roomId).emit('user-connected', socket.id);

    // მოთამაშეს ვუგზავნით იმ ხალხის სიას, ვინც უკვე ოთახშია (WebRTC-სთვის)
    socket.emit('get-users', rooms[roomId].filter(id => id !== socket.id));
  });

  // WebRTC სიგნალიზაცია (ხმის გადასაცემად)
  socket.on('offer', (payload) => {
    io.to(payload.target).emit('offer', {
      offer: payload.offer,
      sender: socket.id
    });
  });

  socket.on('answer', (payload) => {
    io.to(payload.target).emit('answer', {
      answer: payload.answer,
      sender: socket.id
    });
  });

  socket.on('ice-candidate', (payload) => {
    io.to(payload.target).emit('ice-candidate', {
      candidate: payload.candidate,
      sender: socket.id
    });
  });

  socket.on('disconnect', () => {
    console.log('მომხმარებელი გაითიშა:', socket.id);
    for (const roomId in rooms) {
      rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
      socket.to(roomId).emit('user-disconnected', socket.id);
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`სერვერი ჩართულია პორტზე: ${PORT}`);
});
