const tracer = require('dd-trace').init({
  logInjection: true,
  service: 'mypatholabs-server',
  env: process.env.NODE_ENV || 'production',
  version: process.env.npm_package_version || require('./package.json').version || '1.0.0'
});

const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');
const { notFound, errorHandler } = require('./middlewares/errorHandler');
const http = require('http');
const socketService = require('./services/socketService');

const morgan = require('morgan');
const logger = require('./utils/logger');



// Load env vars
dotenv.config();

// Assert critical environment variables
const requiredEnvVars = ['MONGO_URI', 'JWT_SECRET', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
const missingVars = requiredEnvVars.filter(envVar => !process.env[envVar]);
if (missingVars.length > 0) {
  logger.error(`[FATAL] Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

// Connect to database
connectDB();

const app = express();

// HTTP Request Logging with Morgan
app.use(morgan('combined', { stream: logger.stream }));

// Trust the reverse proxy (e.g., Render) so rate limiters use the correct client IP
app.set('trust proxy', 1);
app.set('etag', 'strong');
// ---------- Security Middleware ----------

// CORS — whitelist origins from environment variable
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [];

app.use(cors({
  origin: function (origin, callback) {
    // In development, allow all origins to make local network testing easy
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    // Check if origin is in whitelist
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }

    return callback(new Error('CORS not allowed'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition'],
  credentials: true,
  optionsSuccessStatus: 200
}));

// Security headers (stricter CSP)
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Allow UI scripts but block external malicious scripts
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com"],
      connectSrc: ["'self'", "https://api.mypatholabs.tech", "https://mylaboratory.onrender.com"]
    }
  } : false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Response compression
app.use(compression());

// General rate limiting — 500 requests per 15 minutes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  skip: (req) => req.method === 'OPTIONS',
  message: { success: false, error: 'Too many requests, please try again later' }
});
app.use(generalLimiter);

// Strict rate limiting for auth routes — 20 requests per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skip: (req) => req.method === 'OPTIONS',
  message: { success: false, error: 'Too many authentication attempts, please try again later' }
});

// Body parser with safe limits
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());

// ---------- NoSQL Injection Sanitizer ----------
// We wrap mongoSanitize to avoid reassigning req.query (which is read-only in Express 5).
// The .sanitize() method mutates the properties safely in-place.
app.use((req, res, next) => {
  if (req.body) mongoSanitize.sanitize(req.body);
  if (req.query) mongoSanitize.sanitize(req.query);
  if (req.params) mongoSanitize.sanitize(req.params);
  next();
});



// ---------- Routes ----------
const auth = require('./routes/auth');
const staff = require('./routes/staff');
const patients = require('./routes/patients');
const reports = require('./routes/reports');
const templates = require('./routes/templates');
const dashboard = require('./routes/dashboard');
const settings = require('./routes/settings');
const superadmin = require('./routes/superadmin');
const search = require('./routes/search');
const signatures = require('./routes/signatures');
const notifications = require('./routes/notifications');
const referrals = require('./routes/referralRoutes');

const { protect } = require('./middlewares/authMiddleware');

// ---------- Global API Protection ----------
// Ensure every backend API requires user login, except specific public endpoints
app.use('/api', (req, res, next) => {
  const publicRoutes = [
    '/auth/login',
    '/auth/register',
    '/auth/setup-superadmin',
    '/staff/complete-registration'
  ];

  if (publicRoutes.includes(req.path) || req.path.startsWith('/staff/verify-invite/')) {
    return next();
  }

  return protect(req, res, next);
});

// Mount routers (auth routes get stricter rate limiting)
app.use('/api/auth', authLimiter, auth);
app.use('/api/staff', authLimiter, staff);
app.use('/api/patients', patients);
app.use('/api/templates', templates);
app.use('/api/reports', reports);
app.use('/api/settings', settings);
app.use('/api/dashboard', dashboard);
app.use('/api/superadmin', superadmin);
app.use('/api/search', search);
app.use('/api/signatures', signatures);
app.use('/api/notifications', notifications);
app.use('/api/referrals', referrals);

app.get('/', (req, res) => {
  res.json({ success: true, message: 'LIS API is running' });
});

// ---------- Soft Delete Cleanup Job ----------
// Runs every 24 hours to permanently delete labs deleted > 30 days ago and not held
// Delayed first run by 5 minutes to avoid heavy work during cold start
const runCleanupJob = async () => {
  try {
    const User = require('./models/User');
    const ReportInstance = require('./models/ReportInstance');
    const ReportTemplate = require('./models/ReportTemplate');
    const Patient = require('./models/Patient');
    const PrintSettings = require('./models/PrintSettings');
    const Referral = require('./models/Referral');
    const Invitation = require('./models/Invitation');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Find admins to delete permanently
    const labsToDelete = await User.find({
      role: 'Admin',
      isDeleted: true,
      deletedAt: { $lte: thirtyDaysAgo },
      holdDeletion: false
    });

    if (labsToDelete.length > 0) {
      const adminIds = labsToDelete.map(lab => lab._id);
      
      
      // Get all staff IDs to delete notifications or records owned by them
      const staffUsers = await User.find({ parentAdminId: { $in: adminIds } });
      const staffIds = staffUsers.map(u => u._id);
      const allUserIds = [...adminIds, ...staffIds];

      // Delete orphaned data associated with these Admin IDs (tenant owner)
      await ReportInstance.deleteMany({ doctorId: { $in: adminIds } });
      await ReportTemplate.deleteMany({ doctorId: { $in: adminIds } });
      await Patient.deleteMany({ doctorId: { $in: adminIds } });
      await PrintSettings.deleteMany({ doctorId: { $in: adminIds } });
      await Referral.deleteMany({ doctorId: { $in: adminIds } });
      await Invitation.deleteMany({ doctorId: { $in: adminIds } });

      // Delete all staff under these admins
      await User.deleteMany({ parentAdminId: { $in: adminIds } });
      
      // Delete the admins themselves
      await User.deleteMany({ _id: { $in: adminIds } });
      
      console.log(`Permanently deleted ${labsToDelete.length} labs.`);
    }
  } catch (error) {
    console.error('Error running cleanup job:', error);
  }
};

// Start cleanup: initial delay + recurring interval
setTimeout(() => {
  runCleanupJob();
  setInterval(runCleanupJob, 24 * 60 * 60 * 1000);
}, 5 * 60 * 1000);

// ---------- Error Handling ----------
app.use(notFound);
app.use(errorHandler);

// ---------- Start Server ----------
const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
socketService.init(server);

server.listen(PORT, '0.0.0.0', () => {
  logger.info(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

// ---------- Graceful Shutdown ----------
const gracefulShutdown = (signal) => {
  logger.info(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    const mongoose = require('mongoose');
    mongoose.connection.close(false).then(() => {
      logger.info('MongoDB connection closed.');
      process.exit(0);
    });
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`, err);
  server.close(() => process.exit(1));
});
