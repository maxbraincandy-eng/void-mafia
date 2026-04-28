const jwt = require('jsonwebtoken');
const SECRET = process.env.JWT_SECRET || 'შენი_საიდუმლო_კოდი';

const authMiddleware = (socket, next) => {
  const token = socket.handshake.auth.token;
  
  if (!token) {
    return next(new Error("AUTHENTICATION_FAILED: No token provided"));
  }

  try {
    const payload = jwt.verify(token, SECRET);
    socket.user = payload;
    next();
  } catch (err) {
    next(new Error("AUTHENTICATION_FAILED: Invalid token"));
  }
};

module.exports = authMiddleware;
