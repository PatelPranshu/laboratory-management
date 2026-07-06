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

    // Always verify the user exists and is active in the database,
    // regardless of whether the token contains role claims (Zero-Hit) or not.
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ success: false, error: 'User no longer exists' });
    }

    // Block suspended or non-active accounts
    if (user.accountStatus !== 'Active') {
      return res.status(401).json({ success: false, error: `Account is ${user.accountStatus}. Please contact your administrator.` });
    }

    if (user.isDeleted) {
      const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'pranshuvramani@gmail.com';
      return res.status(401).json({ success: false, error: `Account is deleted. Please contact super admin with mail id (${adminEmail}) to restore.` });
    }

    // Check if user changed password after the token was issued
    if (user.passwordChangedAt) {
      const changedTimestamp = parseInt(user.passwordChangedAt.getTime() / 1000, 10);
      if (decoded.iat < changedTimestamp) {
        return res.status(401).json({ success: false, error: 'User recently changed password, please log in again' });
      }
    }

    // Attach verified user info from database (not from token claims)
    req.user = {
      id: user._id,
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

module.exports = { protect, authorize };
