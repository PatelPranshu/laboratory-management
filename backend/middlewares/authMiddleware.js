const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ---------- Lightweight Auth Cache ----------
// Avoids a DB query on every single API request.
// TTL: 60 seconds. Max entries: 500 (auto-prune oldest).
// Invalidated when user changes password (JWT iat check) or account state changes.
const AUTH_CACHE_TTL_MS = 60 * 1000;
const AUTH_CACHE_MAX = 500;
const authCache = new Map();

const getCachedUser = (userId) => {
  const entry = authCache.get(userId);
  if (!entry) return null;
  if (Date.now() - entry.ts > AUTH_CACHE_TTL_MS) {
    authCache.delete(userId);
    return null;
  }
  return entry.user;
};

const setCachedUser = (userId, userData) => {
  // Evict oldest entries if cache is full
  if (authCache.size >= AUTH_CACHE_MAX) {
    const firstKey = authCache.keys().next().value;
    authCache.delete(firstKey);
  }
  authCache.set(userId, { user: userData, ts: Date.now() });
};

// Exported for use when user state changes (password, status, deletion)
const invalidateAuthCache = (userId) => {
  authCache.delete(String(userId));
};

const protect = async (req, res, next) => {
  let token;

  if (req.cookies && req.cookies.lis_token) {
    token = req.cookies.lis_token;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ success: false, error: 'Not authorized — no token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

    // Try cache first — avoids DB query on every request
    let user = getCachedUser(decoded.id);

    if (!user) {
      // Cache miss — fetch from DB
      const dbUser = await User.findById(decoded.id);

      if (!dbUser) {
        return res.status(401).json({ success: false, error: 'User no longer exists' });
      }

      // Block suspended or non-active accounts
      if (dbUser.accountStatus !== 'Active') {
        return res.status(401).json({ success: false, error: `Account is ${dbUser.accountStatus}. Please contact your administrator.` });
      }

      if (dbUser.isDeleted) {
        const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'pranshuvramani@gmail.com';
        return res.status(401).json({ success: false, error: `Account is deleted. Please contact super admin with mail id (${adminEmail}) to restore.` });
      }

      // Check if user changed password after the token was issued
      if (dbUser.passwordChangedAt) {
        const changedTimestamp = parseInt(dbUser.passwordChangedAt.getTime() / 1000, 10);
        if (decoded.iat < changedTimestamp) {
          return res.status(401).json({ success: false, error: 'User recently changed password, please log in again' });
        }
      }

      // Build cache-friendly user object
      user = {
        id: dbUser._id,
        role: dbUser.role,
        parentAdminId: dbUser.parentAdminId,
        name: dbUser.name,
        passwordChangedAt: dbUser.passwordChangedAt ? dbUser.passwordChangedAt.getTime() : null
      };

      setCachedUser(decoded.id, user);
    } else {
      // Cache hit — still verify token wasn't issued before password change
      if (user.passwordChangedAt) {
        const changedTimestamp = parseInt(user.passwordChangedAt / 1000, 10);
        if (decoded.iat < changedTimestamp) {
          invalidateAuthCache(decoded.id);
          return res.status(401).json({ success: false, error: 'User recently changed password, please log in again' });
        }
      }
    }

    // Attach verified user info
    req.user = {
      id: user.id,
      role: user.role,
      parentAdminId: user.parentAdminId,
      name: user.name,
    };

    next();
  } catch (err) {
    // Differentiate expired vs. invalid tokens
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token has expired, please log in again' });
    }
    return res.status(401).json({ success: false, error: 'Not authorized — invalid token' });
  }
};

// Grant access to specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to perform this action'
      });
    }
    next();
  };
};

module.exports = { protect, authorize, invalidateAuthCache };
