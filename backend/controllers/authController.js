const User = require('../models/User');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

// Generate JWT Helper — 8 hour expiry
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '8h'
  });
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public (first Doctor only) / Private (LabTech requires parent Doctor token)
exports.register = async (req, res) => {
  const { email, password, role, labName, name, parentAdminId } = req.body;

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
    const err = new Error('Only Lab Admins can register publicly. Staff must be invited.');
    err.statusCode = 403;
    throw err;
  }

  // --- Check existing user ---
  const userExists = await User.findOne({ email: email.toLowerCase().trim() });
  if (userExists) {
    const err = new Error('An account with this email already exists');
    err.statusCode = 400;
    throw err;
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const userFields = {
      email: email.toLowerCase().trim(),
      name: name.trim(),
      password,
      role: userRole,
      labName: labName.trim(),
      accountStatus: 'Active' // Admins are active immediately
    };

    const users = await User.create([userFields], { session });
    const user = users[0];
    
    // Auto-create blank PrintSettings for the new Lab Admin
    const PrintSettings = require('../models/PrintSettings');
    await PrintSettings.create([{ doctorId: user._id }], { session });

    await session.commitTransaction();
    session.endSession();

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
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  const { email, password } = req.body;

  // Check for user (case-insensitive email)
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

  if (!user) {
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    throw err;
  }

  // Check if password matches
  const isMatch = await user.matchPassword(password);

  if (!isMatch) {
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    throw err;
  }
  
  if (user.accountStatus !== 'Active') {
    const err = new Error(`Account is ${user.accountStatus}`);
    err.statusCode = 403;
    throw err;
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
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  res.status(200).json({ success: true, data: user });
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
exports.updateProfile = async (req, res) => {
  const user = await User.findById(req.user.id).select('+password');

  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  const { email, labName, name, password } = req.body;

  // Update email if provided
  if (email && email !== user.email) {
    const emailExists = await User.findOne({ email: email.toLowerCase().trim() });
    if (emailExists) {
      const err = new Error('Email already in use');
      err.statusCode = 400;
      throw err;
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
};

// @desc    Reset password (force change)
// @route   POST /api/auth/reset-password
// @access  Private
exports.resetPassword = async (req, res) => {
  const { newPassword } = req.body;

  const user = await User.findById(req.user.id).select('+password');
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  if (!user.mustChangePassword) {
    const err = new Error('Password reset is not required for this account.');
    err.statusCode = 403;
    throw err;
  }

  // Check if new password is same as old password
  const isSamePassword = await user.matchPassword(newPassword);
  if (isSamePassword) {
    const err = new Error('New password must be different from the temporary one.');
    err.statusCode = 400;
    throw err;
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
};
