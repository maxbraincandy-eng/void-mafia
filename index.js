const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // ნებას რთავს ნებისმიერ კავშირს
    methods: ["GET", "POST"]
  }
});

const mongoURI = "mongodb+srv://maxbraincandy_db_user:C8yIfHgHiNCCukBw@cluster0.enaxpdp.mongodb.net/mafia_db?retryWrites=true&w=majority&appName=Cluster0"; 

mongoose.connect(mongoURI)
  .then(() => console.log('MongoDB Connected Successfully!'))
  .catch(err => console.log('Database Connection Error:', err));

// მთავარი გვერდის შეტყობინება (რომ "Not Found" აღარ დაწეროს)
app.get('/', (req, res) => {
  res.send('Void Mafia Server is Running! Ready for WebRTC.');
});

// WebRTC სიგნალიზაციის ლოგიკა
io.on('connection', (socket) => {
  console.log('New Player Connected:', socket.id);

  // როცა მოთამაშე უერთდება კონკრეტულ ოთახს
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    socket.to(roomId).emit('user-connected', socket.id);
  });

  // WebRTC "Offer"-ის გადაცემა
  socket.on('offer', (data) => {
    socket.to(data.roomId).emit('offer', {
      offer: data.offer,
      senderId: socket.id
    });
  });

  // WebRTC "Answer"-ის გადაცემა
  socket.on('answer', (data) => {
    socket.to(data.roomId).emit('answer', {
      answer: data.answer,
      senderId: socket.id
    });
  });

  // ICE Candidates-ის გაცვლა (აუცილებელია კავშირისთვის)
  socket.on('ice-candidate', (data) => {
    socket.to(data.roomId).emit('ice-candidate', {
      candidate: data.candidate,
      senderId: socket.id
    });
  });

  socket.on('disconnect', () => {
    console.log('Player Disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
