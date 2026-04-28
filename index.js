const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// შენი მონაცემები უკვე ჩავსვი აქ
const mongoURI = "mongodb+srv://maxbraincandy_db_user:C8yIfHgHiNCCukBw@cluster0.enaxpdp.mongodb.net/mafia_db?retryWrites=true&w=majority&appName=Cluster0"; 

mongoose.connect(mongoURI)
  .then(() => console.log('MongoDB Connected Successfully!'))
  .catch(err => console.log('Database Connection Error:', err));

app.get('/', (req, res) => {
  res.send('Void Mafia Server is Running!');
});

// მოთამაშეების დაკავშირების ლოგიკა
io.on('connection', (socket) => {
  console.log('New Player Connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('Player Disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
