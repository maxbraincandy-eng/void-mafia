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

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);

// ლოკალური მეხსიერება აქტიური სესიებისთვის (სწრაფი წვდომისთვის)
const activeUsers = {}; 

async function broadcastRooms() {
    try {
        const roomList = await Room.find({ status: 'waiting' }).populate('players', 'username');
        const formattedList = roomList.map(r => ({
            id: r._id,
            name: r.name,
            playerCount: r.players.length,
            gameState: r.status
        }));
        io.emit('update-room-list', formattedList);
    } catch (err) {
        console.error("Error broadcasting rooms:", err);
    }
}

// Socket.io Middleware - ავტორიზაციის შემოწმება
io.use(authMiddleware);

io.on('connection', (socket) => {
    // socket.user უკვე ხელმისაწვდომია authMiddleware-ის წყალობით
    console.log(`✅ Connected: ${socket.user.username}`);
    broadcastRooms();

    socket.on('join-room', async (roomId) => {
        try {
            let room = await Room.findById(roomId);
            if (!room) return socket.emit('error-msg', 'ოთახი ვერ მოიძებნა');

            socket.join(roomId);
            
            // მომხმარებლის დამატება ოთახში ბაზის დონეზე
            if (!room.players.includes(socket.user.id)) {
                room.players.push(socket.user.id);
                await room.save();
            }

            activeUsers[socket.id] = { 
                id: socket.user.id, 
                nickname: socket.user.username, 
                roomId: roomId,
                role: null 
            };

            if (room.createdBy.toString() === socket.user.id) {
                socket.emit('is-host');
            }

            broadcastRooms();

            // სხვა მომხმარებლების ინფორმირება (WebRTC-სთვის)
            const otherUsersInRoom = [];
            for (let [id, user] of Object.entries(activeUsers)) {
                if (user.roomId === roomId && id !== socket.id) {
                    otherUsersInRoom.push({ id, nickname: user.nickname });
                }
            }
            socket.emit('all-users', otherUsersInRoom);
            
        } catch (err) {
            console.error(err);
        }
    });

    socket.on('start-game', async (roomId) => {
        try {
            const room = await Room.findById(roomId);
            if (room && room.createdBy.toString() === socket.user.id && room.players.length >= 3) {
                room.status = 'playing';
                await room.save();
                
                const roles = ['Mafia', 'Doctor', 'Detective'];
                while (roles.length < room.players.length) roles.push('Citizen');
                roles.sort(() => Math.random() - 0.5);

                room.players.forEach((playerId, index) => {
                    io.to(roomId).emit('assign-role-to-user', { 
                        userId: playerId, 
                        role: roles[index] 
                    });
                });

                broadcastRooms();
                runGameCycle(roomId, 0);
            } else {
                socket.emit('error-msg', 'თამაშის დასაწყებად საჭიროა მინიმუმ 3 მოთამაშე!');
            }
        } catch (err) {
            console.error(err);
        }
    });

    // ... (runGameCycle, startVotingPhase და სხვა ფუნქციები დარჩება მსგავსი, 
    // ოღონდ მონაცემებს წამოიღებს Room მოდელიდან)

    socket.on('disconnect', async () => {
        const user = activeUsers[socket.id];
        if (user) {
            try {
                await Room.findByIdAndUpdate(user.roomId, {
                    $pull: { players: user.id }
                });
                delete activeUsers[socket.id];
                broadcastRooms();
                console.log(`❌ Disconnected: ${user.nickname}`);
            } catch (err) {
                console.error(err);
            }
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 VOID_MAFIA_ENGINE_READY: PORT_${PORT}`));
