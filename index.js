const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// აქ ჩასვი შენი MongoDB Connection String
// <password>-ის ნაცვლად ჩაწერე შენი ნამდვილი პაროლი
const mongoURI = "შენი_ლინკი_აქ"; 

mongoose.connect(mongoURI)
  .then(() => console.log('MongoDB Connected...'))
  .catch(err => console.log('Database Error:', err));

app.get('/', (req, res) => {
  res.send('Void Mafia Server is Running!');
});

// მარტივი ლოგიკა სოკეტებისთვის
io.on('connection', (socket) => {
  console.log('New Player Connected:', socket.id);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
