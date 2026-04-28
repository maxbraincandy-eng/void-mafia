const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'void_secret_key_2026';

module.exports = (socket, next) => {
    // ვამოწმებთ ტოკენს handshake-ში ან query-ში
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
        console.log("❌ კავშირი უარყოფილია: ტოკენი არ არსებობს");
        return next(new Error('AUTHENTICATION_FAILED: NO_TOKEN_PROVIDED'));
    }

    try {
        const decoded = jwt.verify(token, SECRET);
        socket.user = {
            id: decoded.id,
            username: decoded.username,
            role: decoded.role
        };
        next();
    } catch (err) {
        console.log("❌ კავშირი უარყოფილია: არასწორი ტოკენი");
        return next(new Error('AUTHENTICATION_FAILED: INVALID_TOKEN'));
    }
};
