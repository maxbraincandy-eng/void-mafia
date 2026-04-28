const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const mongoURI = "mongodb+srv://maxbraincandy_db_user:C8yIfHgHiNCCukBw@cluster0.enaxpdp.mongodb.net/mafia_db?retryWrites=true&w=majority&appName=Cluster0"; 

mongoose.connect(mongoURI)
  .then(() => console.log('MongoDB Connected Successfully!'))
  .catch(err => console.log('Database Connection Error:', err));

app.get('/', (req, res) => {
  res.send('Void Mafia Server is Running! Room Management Active.');
});

// ოთახების მონაცემების შესანახად (დროებითი მეხსიერება)
const rooms = {};

io.on('connection', (socket) => {
  console.log('User Connected:', socket.id);

  socket.on('join-room', (roomId, userId) => {
    // თუ ოთახი არ არსებობს, ვქმნით
    if (!rooms[roomId]) {
      rooms[roomId] = [];
    }

    // ვამოწმებთ, რომ ოთახი არ იყოს გადავსებული (მაგალითად მაქს 15 კაცი)
    if (rooms[roomId].length >= 15) {
      socket.emit('error', 'ოთახი სავსეა!');
      return;
    }

    rooms[roomId].push(socket.id);
    socket.join(roomId);
    
    console.log(`User ${socket.id} joined room: ${roomId}`);

    // ვატყობინებთ სხვებს ოთახში, რომ ახალი მოთამაშე შემოვიდა (WebRTC-სთვის)
    socket.to(roomId).emit('user-connected', socket.id);

    // მოთამაშეს ვუგზავნით იმ ხალხის სიას, ვინც უკვე ოთახშია
    socket.emit('get-users', rooms[roomId].filter(id => id !== socket.id));
  });

  // WebRTC სიგნალები
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
    console.log('User Disconnected:', socket.id);
    // ოთახიდან მოთამაშის ამოშლა
    for (const roomId in rooms) {
      rooms[roomId] = rooms[roomId].filter(id => id !== socket.id);
      if (rooms[roomId].length === 0) {
        delete rooms[roomId];
      } else {
        socket.to(roomId).emit('user-disconnected', socket.id);
      }
    }
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
