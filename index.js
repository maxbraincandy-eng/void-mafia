
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
const MONGO_URI = "mongodb+srv://maxbraincandy_db_user:C8yIfHgHiNCCukBw@cluster0.enaxpdp.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URI).then(() => console.log('✅ DATABASE_CONNECTED'));

app.use(express.static(path.join(__dirname, 'public')));

const users = {};

io.on('connection', (socket) => {
    socket.on('join_room', (roomCode, playerName) => {
        socket.join(roomCode);
        users[socket.id] = { name: playerName, room: roomCode };
        
        const otherUsers = Array.from(io.sockets.adapter.rooms.get(roomCode) || [])
            .filter(id => id !== socket.id);
        
        socket.emit('all_users', otherUsers);
    });

    socket.on('sending_signal', payload => {
        io.to(payload.userToSignal).emit('user_joined', {
            signal: payload.signal,
            callerID: payload.callerID
        });
    });

    socket.on('returning_signal', payload => {
        io.to(payload.callerID).emit('receiving_returned_signal', {
            signal: payload.signal,
            id: socket.id
        });
    });

    socket.on('disconnect', () => {
        const room = users[socket.id]?.room;
        delete users[socket.id];
        io.to(room).emit('user_left', socket.id);
    });
});

server.listen(PORT, '0.0.0.0', () => console.log(`🚀 VOID_CORE_UP`));
