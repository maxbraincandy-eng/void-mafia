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
const rooms = {}; 

function broadcastRooms() {
    const roomList = Object.values(rooms).map(r => ({
        id: r.id,
        name: r.name,
        playerCount: r.playerCount,
        gameState: r.gameState // waiting ან playing
    }));
    io.emit('update-room-list', roomList); 
}

io.on('connection', (socket) => {
    broadcastRooms();

    socket.on('join-room', (roomId, nickname) => {
        socket.join(roomId);
        
        // ოთახის ინიციალიზაცია თუ არ არსებობს
        if (!rooms[roomId]) {
            rooms[roomId] = { 
                id: roomId, 
                name: roomId, 
                playerCount: 0, 
                host: socket.id, // პირველი ვინც შევა არის ჰოსტი
                gameState: 'waiting',
                players: [] 
            };
        }

        rooms[roomId].playerCount++;
        rooms[roomId].players.push(socket.id);
        
        users[socket.id] = { id: socket.id, nickname, roomId };

        // თუ ეს მომხმარებელი ჰოსტია, ვატყობინებთ
        if (rooms[roomId].host === socket.id) {
            socket.emit('is-host');
        }

        broadcastRooms();

        // ვაგროვებთ სხვა მომხმარებლებს ამავე ოთახში WebRTC-სთვის
        const otherUsersInRoom = [];
        for (const id in users) {
            if (users[id].roomId === roomId && id !== socket.id) {
                otherUsersInRoom.push({ id: id, nickname: users[id].nickname });
            }
        }

        socket.emit('all-users', otherUsersInRoom);
    });

    // --- თამაშის დაწყება და როლების დარიგება ---
    socket.on('start-game', (roomId) => {
        const room = rooms[roomId];
        if (room && room.host === socket.id) {
            room.gameState = 'playing';
            
            const playerIds = room.players;
            const roles = ['Mafia', 'Doctor', 'Detective']; // ძირითადი როლები
            
            // ვავსებთ დანარჩენ ადგილებს მოქალაქეებით
            while (roles.length < playerIds.length) {
                roles.push('Citizen');
            }

            // როლების არევა (Shuffle)
            roles.sort(() => Math.random() - 0.5);

            // თითოეულ მოთამაშეს ვუგზავნით თავის როლს
            playerIds.forEach((id, index) => {
                io.to(id).emit('assign-role', roles[index]);
            });

            broadcastRooms();
        }
    });

    // --- WebRTC სიგნალიზაცია (აქ იყო შეცდომა და გასწორდა) ---
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
            socket.to(roomId).emit('user-left', socket.id);
            
            if (rooms[roomId]) {
                rooms[roomId].playerCount--;
                rooms[roomId].players = rooms[roomId].players.filter(id => id !== socket.id);
                
                // თუ ჰოსტი გავიდა, ახალ ჰოსტს ვნიშნავთ
                if (rooms[roomId].host === socket.id && rooms[roomId].players.length > 0) {
                    rooms[roomId].host = rooms[roomId].players[0];
                    io.to(rooms[roomId].host).emit('is-host');
                }

                if (rooms[roomId].playerCount <= 0) {
                    delete rooms[roomId];
                }
            }
            
            delete users[socket.id];
            broadcastRooms();
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
