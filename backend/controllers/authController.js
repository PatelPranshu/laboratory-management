const User = require('../models/User');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role, parentAdminId: user.parentAdminId, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
};

// Helper function to send token in HttpOnly cookie
const sendTokenResponse = (user, statusCode, res) => {
  const token = generateToken(user);

  const options = {
    expires: new Date(Date.now() + 8 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  };

  res
    .status(statusCode)
    .cookie('lis_token', token, options)
    .json({
      success: true,
      token, // Kept for backwards compatibility
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

    sendTokenResponse(user, 201, res);
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

  sendTokenResponse(user, 200, res);
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

  // Update labName if provided and changed (Only Admins)
  if (labName && labName.trim() !== user.labName) {
    if (user.role === 'Admin') {
      const newLabName = labName.trim();
      user.labName = newLabName;
      
      // Propagate the labName change to all staff users belonging to this Admin
      await User.updateMany(
        { parentAdminId: user._id },
        { $set: { labName: newLabName } }
      );
    }
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

  sendTokenResponse(user, 200, res);
};

// @desc    Log user out / clear cookie
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res) => {
  res.cookie('lis_token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  });

  res.status(200).json({
    success: true,
    data: {}
  });
};
