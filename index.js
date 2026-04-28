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
mongoose.connect(mongoURI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ DB Error:', err));

// ობიექტი მომხმარებლების მონაცემების შესანახად
const users = {}; 

io.on('connection', (socket) => {
    console.log('📱 New connection:', socket.id);

    socket.on('join-room', (roomId, nickname) => {
        socket.join(roomId);
        
        // ვინახავთ მომხმარებლის ინფორმაციას სოკეტის აიდით
        users[socket.id] = { id: socket.id, nickname, roomId };

        // ვპოულობთ ყველა სხვა მომხმარებელს, ვინც უკვე ამავე ოთახშია
        const otherUsersInRoom = [];
        for (const id in users) {
            if (users[id].roomId === roomId && id !== socket.id) {
                otherUsersInRoom.push({ 
                    id: id, 
                    nickname: users[id].nickname 
                });
            }
        }

        console.log(`👤 ${nickname} (${socket.id}) joined room: ${roomId}`);

        // ვუგზავნით ახალ შემოსულს იმ ხალხის სიას, ვინც უკვე ოთახშია
        socket.emit('all-users', otherUsersInRoom);
    });

    socket.on('sending-signal', payload => {
        // გადავცემთ სიგნალს და გამომძახებლის სახელს
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
            console.log(`🔌 ${user.nickname} disconnected`);
            // ვატყობინებთ სხვებს ოთახში, რომ ეს მომხმარებელი გავიდა
            socket.to(user.roomId).emit('user-left', socket.id);
            delete users[socket.id];
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
