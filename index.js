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
        playerCount: r.players.length,
        gameState: r.gameState
    }));
    io.emit('update-room-list', roomList); 
}

io.on('connection', (socket) => {
    broadcastRooms();

    socket.on('join-room', (roomId, nickname, type = 'player') => {
        socket.join(roomId);
        
        if (!rooms[roomId]) {
            rooms[roomId] = { 
                id: roomId, 
                name: roomId, 
                host: socket.id, 
                gameState: 'waiting',
                players: [], // მხოლოდ აქტიური მოთამაშეები
                spectators: [], // მაყურებლები
                votes: {} 
            };
        }

        const userData = { id: socket.id, nickname, roomId, type, role: null };
        users[socket.id] = userData;

        if (type === 'player') {
            rooms[roomId].players.push(socket.id);
        } else {
            rooms[roomId].spectators.push(socket.id);
        }

        if (rooms[roomId].host === socket.id) {
            socket.emit('is-host');
        }

        broadcastRooms();

        // WebRTC-სთვის ყველას ვაგზავნით (მოთამაშეებსაც და მაყურებლებსაც)
        const otherUsers = [];
        const allInRoom = [...rooms[roomId].players, ...rooms[roomId].spectators];
        allInRoom.forEach(id => {
            if (id !== socket.id && users[id]) {
                otherUsers.push({ id: id, nickname: users[id].nickname, type: users[id].type });
            }
        });

        socket.emit('all-users', otherUsers);
    });

    // --- თამაშის ძრავა (რიგითობა და როლები) ---
    socket.on('start-game', (roomId) => {
        const room = rooms[roomId];
        if (room && room.host === socket.id && room.players.length >= 3) {
            room.gameState = 'playing';
            
            // 1. როლების დარიგება
            const playerIds = [...room.players];
            const roles = ['Mafia', 'Doctor', 'Detective'];
            while (roles.length < playerIds.length) roles.push('Citizen');
            roles.sort(() => Math.random() - 0.5);

            playerIds.forEach((id, index) => {
                if (users[id]) {
                    users[id].role = roles[index];
                    io.to(id).emit('assign-role', roles[index]);
                }
            });

            broadcastRooms();
            // 2. რიგითობით საუბრის დაწყება
            runGameCycle(roomId, 0);
        } else {
            socket.emit('error-msg', 'თამაშის დასაწყებად საჭიროა მინიმუმ 3 მოთამაშე!');
        }
    });

    function runGameCycle(roomId, playerIndex) {
        const room = rooms[roomId];
        if (!room) return;

        // თუ ყველა მოთამაშემ ისაუბრა, გადავდივართ ხმის მიცემაზე
        if (playerIndex >= room.players.length) {
            startVotingPhase(roomId);
            return;
        }

        const currentPlayerId = room.players[playerIndex];
        const player = users[currentPlayerId];

        if (player) {
            io.to(roomId).emit('next-turn', {
                userId: currentPlayerId,
                nickname: player.nickname,
                seconds: 60
            });

            // 62 წამიანი ტაიმერი (60 საუბრისთვის + 2 გადასვლისთვის)
            setTimeout(() => {
                runGameCycle(roomId, playerIndex + 1);
            }, 62000);
        } else {
            runGameCycle(roomId, playerIndex + 1);
        }
    }

    function startVotingPhase(roomId) {
        const room = rooms[roomId];
        const activePlayers = room.players.map(id => ({ id, nick: users[id].nickname }));
        room.votes = {};
        io.to(roomId).emit('start-voting', activePlayers);

        // 20 წამი ხმის მისაცემად
        setTimeout(() => {
            io.to(roomId).emit('night-phase');
        }, 20000);
    }

    // ხმის მიცემის მიღება
    socket.on('cast-vote', ({ targetId, roomId }) => {
        const room = rooms[roomId];
        if (room) {
            room.votes[targetId] = (room.votes[targetId] || 0) + 1;
            io.to(roomId).emit('update-votes', room.votes);
        }
    });

    // --- WebRTC სიგნალიზაცია ---
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
                rooms[roomId].players = rooms[roomId].players.filter(id => id !== socket.id);
                rooms[roomId].spectators = rooms[roomId].spectators.filter(id => id !== socket.id);
                
                if (rooms[roomId].host === socket.id && (rooms[roomId].players.length > 0 || rooms[roomId].spectators.length > 0)) {
                    rooms[roomId].host = rooms[roomId].players[0] || rooms[roomId].spectators[0];
                    io.to(rooms[roomId].host).emit('is-host');
                }

                if (rooms[roomId].players.length === 0 && rooms[roomId].spectators.length === 0) {
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
                    
