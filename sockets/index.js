const authMiddleware = require('../middleware/auth');

module.exports = (io) => {
  io.use(authMiddleware);

  io.on('connection', (socket) => {
    console.log(`CONNECTED: ${socket.user.username}`);

    socket.on('join-room', (roomId) => {
      // ოთახში შესვლის ლოგიკა
    });

    socket.on('disconnect', () => {
       console.log(`DISCONNECTED: ${socket.user.username}`);
    });
  });
};
