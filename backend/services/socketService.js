const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

let io;

const init = (server) => {
  // Use same ALLOWED_ORIGINS whitelist as Express CORS config
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
    : [];

  io = new Server(server, {
    cors: {
      origin: function (origin, callback) {
        // In development, allow all origins to make local network testing easy
        if (process.env.NODE_ENV !== 'production') {
          return callback(null, true);
        }

        if (!origin || origin === 'https://mypatholabs.tech' || origin === 'https://www.mypatholabs.tech' || origin === 'https://mylaboratory.onrender.com' || origin === 'https://mypatholabs2.onrender.com' || origin === 'https://mypatholabs3.onrender.com' || allowedOrigins.indexOf(origin) !== -1) {
          return callback(null, true);
        }

        return callback(new Error('CORS not allowed'), false);
      },
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  io.use((socket, next) => {
    try {
      let token = socket.handshake.auth.token;
      
      // Fallback to cookie if auth token is not provided (HttpOnly cookie approach)
      if (!token && socket.request.headers.cookie) {
        const cookies = socket.request.headers.cookie.split(';').reduce((res, c) => {
          const [key, val] = c.trim().split('=').map(decodeURIComponent);
          res[key] = val;
          return res;
        }, {});
        token = cookies['lis_token'];
      }

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
