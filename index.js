const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ეს ხაზი აუცილებელია, რომ სერვერმა index.html ფაილი გახსნას
app.use(express.static(path.join(__dirname, 'public')));

const mongoURI = "mongodb+srv://maxbraincandy_db_user:C8yIfHgHiNCCukBw@cluster0.enaxpdp.mongodb.net/mafia_db?retryWrites=true&w=majority&appName=Cluster0"; 

mongoose.connect(mongoURI)
  .then(() => console.log('MongoDB Connected!'))
  .catch(err => console.error('DB Error:', err));

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (roomId, userId) => {
    socket.join(roomId);
    console.log(`User ${userId} joined room: ${roomId}`);
    socket.to(roomId).emit('user-connected', socket.id);
  });

  socket.on('disconnect', () => console.log('User disconnected'));
});

// Render-ისთვის საჭირო პორტი
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
