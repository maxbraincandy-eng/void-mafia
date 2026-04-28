require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const authMiddleware = require('./middleware/auth');
const Room = require('./models/Room');
const User = require('./models/User');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// მონაცემთა ბაზასთან კავშირი
connectDB();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);

// აქტიური სესიები სწრაფი წვდომისთვის
const activeUsers = {}; 

async function broadcastRooms() {
    try {
        const roomList = await Room.find({ status: 'waiting' });
        const formattedList = roomList.map(r => ({
            id: r._id,
            name: r.name,
            playerCount: r.players.length,
            gameState: r.status
        }));
        io.emit('update-room-list', formattedList);
    } catch (err) {
        console.error("Broadcasting Error:", err);
    }
}

// Socket.io Middleware
io.use(authMiddleware);

io.on('connection', (socket) => {
    console.log(`✅ Connected: ${socket.user.username}`);
    broadcastRooms();

    socket.on('join-room', async (roomId) => {
        try {
            let room = await Room.findById(roomId);
            if (!room) return socket.emit('error-msg', 'ოთახი ვერ მოიძებნა');

            socket.join(roomId);
            
            if (!room.players.includes(socket.user.id)) {
                room.players.push(socket.user.id);
                await room.save();
            }

            activeUsers[socket.id] = { 
                id: socket.user.id, 
                nickname: socket.user.username, 
                roomId: roomId,
                role: null,
                isAlive: true
            };

            if (room.createdBy.toString() === socket.user.id) {
                socket.emit('is-host');
            }

            broadcastRooms();

            // WebRTC სია
            const otherUsers = [];
            for (let [id, user] of Object.entries(activeUsers)) {
                if (user.roomId === roomId && id !== socket.id) {
                    otherUsers.push({ id: id, nickname: user.nickname });
                }
            }
            socket.emit('all-users', otherUsers);
            
        } catch (err) {
            console.error(err);
        }
    });

    // --- თამაშის ძრავა ---
    socket.on('start-game', async (roomId) => {
        try {
            const room = await Room.findById(roomId);
            if (room && room.createdBy.toString() === socket.user.id && room.players.length >= 3) {
                room.status = 'playing';
                await room.save();
                
                const playerEntries = Object.entries(activeUsers).filter(([id, u]) => u.roomId === roomId);
                const roles = ['Mafia', 'Doctor', 'Detective'];
                while (roles.length < playerEntries.length) roles.push('Citizen');
                roles.sort(() => Math.random() - 0.5);

                playerEntries.forEach(([sId, user], index) => {
                    activeUsers[sId].role = roles[index];
                    io.to(sId).emit('assign-role', roles[index]);
                });

                broadcastRooms();
                runGameCycle(roomId, 0);
            } else {
                socket.emit('error-msg', 'საჭიროა მინიმუმ 3 მოთამაშე!');
            }
        } catch (err) {
            console.error(err);
        }
    });

    function runGameCycle(roomId, playerIndex) {
        const playersInRoom = Object.entries(activeUsers).filter(([id, u]) => u.roomId === roomId && u.isAlive);
        
        if (playerIndex >= playersInRoom.length) {
            startVotingPhase(roomId);
            return;
        }

        const [socketId, player] = playersInRoom[playerIndex];
        io.to(roomId).emit('next-turn', {
            userId: socketId,
            nickname: player.nickname,
            seconds: 60
        });

        setTimeout(() => {
            if (activeUsers[socketId]) runGameCycle(roomId, playerIndex + 1);
        }, 62000);
    }

    function startVotingPhase(roomId) {
        const alivePlayers = Object.entries(activeUsers)
            .filter(([id, u]) => u.roomId === roomId && u.isAlive)
            .map(([id, u]) => ({ id, nick: u.nickname }));
            
        io.to(roomId).emit('start-voting', alivePlayers);

        setTimeout(() => {
            io.to(roomId).emit('night-phase');
        }, 20000);
    }

    socket.on('cast-vote', ({ targetId, roomId }) => {
        io.to(roomId).emit('update-votes', { targetId, voter: socket.id });
    });

    // --- WebRTC Signaling ---
    socket.on('sending-signal', payload => {
        io.to(payload.userToSignal).emit('user-joined', {
            signal: payload.signal,
            callerID: payload.callerID,
            nickname: socket.user.username
        });
    });

    socket.on('returning-signal', payload => {
        io.to(payload.callerID).emit('receiving-returned-signal', {
            signal: payload.signal,
            id: socket.id
        });
    });

    socket.on('disconnect', async () => {
        const user = activeUsers[socket.id];
        if (user) {
            try {
                await Room.findByIdAndUpdate(user.roomId, {
                    $pull: { players: user.id }
                });
                delete activeUsers[socket.id];
                socket.to(user.roomId).emit('user-left', socket.id);
                broadcastRooms();
                console.log(`❌ Disconnected: ${user.nickname}`);
            } catch (err) {
                console.error(err);
            }
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 VOID_MAFIA_READY: PORT_${PORT}`));
