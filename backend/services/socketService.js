const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

let io;

const init = (server) => {
  io = new Server(server, {
    cors: {
      origin: "*", // Will be restricted in production config later
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    }
  });

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication Error'));
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      next(new Error('Authentication Error'));
    }
  });

  io.on('connection', (socket) => {
    // console.log(`Socket connected: ${socket.id} user: ${socket.user.id}`);
    
    // Auto-join personal room
    socket.join(`user_${socket.user.id}`);
    
    // Auto-join role room (e.g. role_Admin, role_Doctor, role_LabTech)
    socket.join(`role_${socket.user.role}`);

    socket.on('disconnect', () => {
      // console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized!');
  }
  return io;
};

module.exports = { init, getIO };
