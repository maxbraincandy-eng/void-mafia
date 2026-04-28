const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

const mongoURI = process.env.MONGO_URI;
if (mongoURI) {
    mongoose.connect(mongoURI)
        .then(() => console.log('✅ MongoDB Connected'))
        .catch(err => console.error('❌ DB Error:', err));
}

const users = {}; 
const rooms = {}; // აქ შევინახავთ აქტიურ ოთახებს სტატისტიკისთვის

// ფუნქცია ოთახების სიის ყველასთვის დასაგზავნად
function broadcastRooms() {
    const roomList = Object.values(rooms).map(r => ({
        id: r.id,
        name: r.name,
        playerCount: r.playerCount
    }));
    io.emit('update-room-list', roomList); 
}

io.on('connection', (socket) => {
    console.log('📱 New connection:', socket.id);

    // როგორც კი ვინმე შემოვა საიტზე, ეგრევე ვუგზავნით ოთახების სიას
    broadcastRooms();

    socket.on('join-room', (roomId, nickname) => {
        socket.join(roomId);
        users[socket.id] = { id: socket.id, nickname, roomId };

        // ოთახის ლოგიკა
        if (!rooms[roomId]) {
            rooms[roomId] = { id: roomId, name: roomId, playerCount: 0 };
        }
        rooms[roomId].playerCount++;
        
        // ვაცნობებთ ყველას, რომ ოთახებში ხალხის რაოდენობა შეიცვალა
        broadcastRooms();

        const otherUsersInRoom = [];
        for (const id in users) {
            if (users[id].roomId === roomId && id !== socket.id) {
                otherUsersInRoom.push({ 
                    id: id, 
                    nickname: users[id].nickname 
                });
            }
        }

        console.log(`👤 ${nickname} joined room: ${roomId}`);
        socket.emit('all-users', otherUsersInRoom);
    });

    socket.on('sending-signal', payload => {
        io.to(payload.userToSignal).emit('user-joined', {
            signal: payload.signal,
            callerID: payload.callerID,
            nickname: users[socket.id]?.nickname || "უცნობი"
        });
    });

    socket.on('returning-signal', payload => {
        io.to(payload.callerID).emit('receiving-returned-signal', {
            signal: payload.signal,
            id: socket.id
        });
    });

    socket.on('disconnect', () => {
        const user = users[socket.id];
        if (user) {
            const roomId = user.roomId;
            console.log(`🔌 ${user.nickname} disconnected`);
            
            socket.to(roomId).emit('user-left', socket.id);
            
            if (rooms[roomId]) {
                rooms[roomId].playerCount--;
                if (rooms[roomId].playerCount <= 0) {
                    delete rooms[roomId]; // თუ ოთახი ცარიელია, ვშლით
                }
            }
            
            delete users[socket.id];
            broadcastRooms(); // განახლებული სიის დაგზავნა
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
