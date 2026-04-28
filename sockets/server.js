require('dotenv').config();
const express = require('express');
const http = require('http');
const connectDB = require('./config/db');
const socketHandler = require('./sockets/index');

const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server);

connectDB();
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/rooms', require('./routes/rooms'));

// Sockets
socketHandler(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`VOID_MAFIA_READY: PORT_${PORT}`));
