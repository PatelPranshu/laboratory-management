const jwt = require('jsonwebtoken');
const User = require('../models/User');

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
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // ---------- Zero-Hit Auth (new tokens contain role) ----------
    if (decoded.role) {
      req.user = {
        id: decoded.id,
        role: decoded.role,
        parentAdminId: decoded.parentAdminId,
        name: decoded.name,
      };
      return next();
    }

    // ---------- Fallback for old tokens that only contain { id } ----------
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, error: 'User no longer exists' });
    }

    // Check if user changed password after the token was issued
    if (user.passwordChangedAt) {
      const changedTimestamp = parseInt(user.passwordChangedAt.getTime() / 1000, 10);
      if (decoded.iat < changedTimestamp) {
        return res.status(401).json({ success: false, error: 'User recently changed password, please log in again' });
      }
    }

    req.user = user;
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

module.exports = { protect, authorize };
