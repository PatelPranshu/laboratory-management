const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { isValidEmail, isStrongPassword } = require('../middlewares/validate');

// Generate JWT Helper — 7 day expiry (reduced from 30d)
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '7d'
  });
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public (first Doctor only) / Private (LabTech requires parent Doctor token)
exports.register = async (req, res) => {
  try {
    const { email, password, role, labName, name, parentAdminId } = req.body;

    // --- Input Validation ---
    if (!email || !password || !labName || !name) {
      return res.status(400).json({ success: false, error: 'Name, email, password, and lab name are required' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'Please provide a valid email address' });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters with at least 1 uppercase letter and 1 number'
      });
    }

    // --- Role Validation ---
    let userRole = role;

    // --- Check if first user ---
    const totalUsers = await User.countDocuments();
    if (totalUsers === 0) {
      userRole = 'Admin';
    } else {
      const allowedRoles = ['Admin', 'Doctor', 'LabTech'];
      userRole = allowedRoles.includes(role) ? role : 'Doctor';
    }

    // --- Registration Restrictions ---
    if (userRole !== 'Admin') {
      return res.status(403).json({ success: false, error: 'Only Lab Admins can register publicly. Staff must be invited.' });
    }

    // --- Check existing user ---
    const userExists = await User.findOne({ email: email.toLowerCase().trim() });
    if (userExists) {
      return res.status(400).json({ success: false, error: 'An account with this email already exists' });
    }

    // --- Create user ---
    const userFields = {
      email: email.toLowerCase().trim(),
      name: name.trim(),
      password,
      role: userRole,
      labName: labName.trim(),
      accountStatus: 'Active' // Admins are active immediately
    };

    const user = await User.create(userFields);
    
    // Auto-create blank PrintSettings for the new Lab Admin
    const PrintSettings = require('../models/PrintSettings');
    await PrintSettings.create({ doctorId: user._id });

    res.status(201).json({
      success: true,
      token: generateToken(user._id),
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        labName: user.labName,
        accountStatus: user.accountStatus,
        mustChangePassword: user.mustChangePassword
      }
    });
  } catch (error) {
    console.error('Registration error:', error.message);
    res.status(500).json({ success: false, error: 'Registration failed. Please try again.' });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Please provide an email and password' });
    }

    // Check for user (case-insensitive email)
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Check if password matches
    const isMatch = await user.matchPassword(password);

    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
    
    if (user.accountStatus !== 'Active') {
      return res.status(403).json({ success: false, error: `Account is ${user.accountStatus}` });
    }

    res.status(200).json({
      success: true,
      token: generateToken(user._id),
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        labName: user.labName,
        parentAdminId: user.parentAdminId,
        accountStatus: user.accountStatus,
        mustChangePassword: user.mustChangePassword
      }
    });

  } catch (error) {
    console.error('Login error:', error.message);
    res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    console.error('GetMe error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to retrieve user profile' });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('+password');

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const { email, labName, name, password } = req.body;

    // Update email if provided
    if (email && email !== user.email) {
      if (!isValidEmail(email)) {
        return res.status(400).json({ success: false, error: 'Please provide a valid email address' });
      }
      const emailExists = await User.findOne({ email: email.toLowerCase().trim() });
      if (emailExists) {
        return res.status(400).json({ success: false, error: 'Email already in use' });
      }
      user.email = email.toLowerCase().trim();
    }

    // Update labName if provided
    if (labName) {
      user.labName = labName.trim();
    }

    // Update name if provided
    if (name) {
      user.name = name.trim();
    }

    // Update password if provided (only if non-empty)
    if (password && password.trim() !== '') {
      if (!isStrongPassword(password)) {
        return res.status(400).json({
          success: false,
          error: 'Password must be at least 8 characters with at least 1 uppercase letter and 1 number'
        });
      }
      user.password = password;
    }

    await user.save();

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        labName: user.labName
      }
    });

  } catch (error) {
    console.error('UpdateProfile error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
};

// @desc    Reset password (force change)
// @route   POST /api/auth/reset-password
// @access  Private
exports.resetPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Please provide both current and new passwords' });
    }

    const user = await User.findById(req.user.id).select('+password');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Check current password
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Incorrect current password' });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 8 characters with at least 1 uppercase letter and 1 number'
      });
    }

    user.password = newPassword;
    user.mustChangePassword = false;
    await user.save();

    res.status(200).json({
      success: true,
      token: generateToken(user._id),
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        labName: user.labName,
        accountStatus: user.accountStatus,
        mustChangePassword: user.mustChangePassword
      }
    });
  } catch (error) {
    console.error('resetPassword error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to reset password' });
  }
};
