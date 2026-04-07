const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middlewares/errorHandler');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

// ---------- Security Middleware ----------

// CORS — whitelist origins from environment variable
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Security headers
app.use(helmet());

// Response compression
app.use(compression());

// General rate limiting — 500 requests per 15 minutes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { success: false, error: 'Too many requests, please try again later' }
});
app.use(generalLimiter);

// Strict rate limiting for auth routes — 20 requests per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Too many authentication attempts, please try again later' }
});

// Body parser with size limit to prevent abuse
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

// ---------- NoSQL Injection Sanitizer ----------
function sanitizeObject(obj) {
  if (obj && typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      if (key.startsWith('$') || key.includes('.')) {
        delete obj[key];
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitizeObject(obj[key]);
      }
    }
  }
}
app.use((req, res, next) => {
  if (req.body) sanitizeObject(req.body);
  if (req.params) sanitizeObject(req.params);
  if (req.query) sanitizeObject(req.query);
  next();
});

// ---------- Routes ----------
const auth = require('./routes/auth');
const patients = require('./routes/patients');
const templates = require('./routes/templates');
const reports = require('./routes/reports');
const settings = require('./routes/settings');
const dashboard = require('./routes/dashboard');
const search = require('./routes/search');

// Mount routers (auth routes get stricter rate limiting)
app.use('/api/auth', authLimiter, auth);
app.use('/api/patients', patients);
app.use('/api/templates', templates);
app.use('/api/reports', reports);
app.use('/api/settings', settings);
app.use('/api/dashboard', dashboard);
app.use('/api/search', search);

app.get('/', (req, res) => {
  res.json({ success: true, message: 'LIS API is running' });
});

// ---------- Error Handling ----------
app.use(notFound);
app.use(errorHandler);

// ---------- Start Server ----------
const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

// ---------- Graceful Shutdown ----------
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    const mongoose = require('mongoose');
    mongoose.connection.close(false).then(() => {
      console.log('MongoDB connection closed.');
      process.exit(0);
    });
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err.message);
  server.close(() => process.exit(1));
});
