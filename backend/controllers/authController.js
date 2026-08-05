const User = require('../models/User');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { invalidateAuthCache } = require('../middlewares/authMiddleware');
const crypto = require('crypto');
const { sendPasswordResetEmail, sendVerificationEmail } = require('../services/emailService');
const { logAudit, getClientIp } = require('../middlewares/auditMiddleware');

const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role, parentAdminId: user.parentAdminId, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
};

// Exported for shared use by staffController

// Helper function to send token in HttpOnly cookie
const sendTokenResponse = (user, statusCode, res) => {
  const token = generateToken(user);

  // Expiration time for the frontend to manage its own redirect synchronously
  const expTimeMs = Date.now() + 8 * 60 * 60 * 1000;

  const options = {
    expires: new Date(expTimeMs),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // Only require HTTPS in production
    sameSite: 'lax'
  };

  res
    .status(statusCode)
    .cookie('lis_token', token, options)
    .json({
      success: true,
      exp: Math.floor(expTimeMs / 1000), // Return expiration time in seconds for frontend checking
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        labName: user.labName,
        parentAdminId: user.parentAdminId,
        accountStatus: user.accountStatus,
        isVerified: user.isVerified,

      }
    });
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public (first Doctor only) / Private (LabTech requires parent Doctor token)
exports.register = async (req, res) => {
  const { email, password, role, labName, name, parentAdminId, termsAccepted, privacyAccepted } = req.body;

  if (typeof email !== 'string' || typeof password !== 'string' || typeof name !== 'string' || typeof labName !== 'string') {
    return res.status(400).json({ success: false, error: 'Invalid input format' });
  }

  let userRole = role;
  const allowedRoles = ['Admin', 'Doctor', 'LabTech'];
  userRole = allowedRoles.includes(role) ? role : 'Doctor';

  if (userRole !== 'Admin') {
    const err = new Error('Only Lab Admins can register publicly. Staff must be invited.');
    err.statusCode = 403;
    throw err;
  }

  const userExists = await User.findOne({ email: email.toLowerCase().trim() });
  if (userExists) {
    const err = new Error('An account with this email already exists');
    err.statusCode = 400;
    throw err;
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  let user;
  let verificationToken;

  try {
    const clientIp = getClientIp(req);
    const userAgent = (req.headers['user-agent'] || '').slice(0, 200);

    const userFields = {
      email: email.toLowerCase().trim(),
      name: name.trim(),
      password,
      role: userRole,
      labName: labName.trim(),
      accountStatus: 'Active',
      isVerified: false,
      consentLog: [
        { type: 'terms', version: '2.4.0', acceptedAt: new Date(), ipAddress: clientIp, userAgent },
        { type: 'privacy', version: '3.0.0', acceptedAt: new Date(), ipAddress: clientIp, userAgent }
      ]
    };

    const users = await User.create([userFields], { session });
    user = users[0];

    const PrintSettings = require('../models/PrintSettings');
    await PrintSettings.create([{ doctorId: user._id }], { session });

    verificationToken = user.getVerificationToken();
    await user.save({ session, validateBeforeSave: false });

    // Commit database transaction immediately before making external API call
    await session.commitTransaction();
    session.endSession();
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }

  // Outbound email dispatch is performed outside database transaction for RAM/CPU efficiency
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5500';
  const verifyUrl = `${frontendUrl}/verify-email.html?token=${verificationToken}`;

  try {
    await sendVerificationEmail(user.email, verifyUrl);
  } catch (emailError) {
    console.error(`[AUTH] Failed to send verification email to ${user.email}:`, emailError.message);
  }

  res.status(201).json({
    success: true,
    message: 'Registration successful! Please check your email to verify your account.'
  });
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  const { email, password, termsAccepted, privacyAccepted } = req.body;

  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ success: false, error: 'Invalid input format' });
  }

  // Check for user (case-insensitive email)
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

  if (!user) {
    logAudit('LOGIN_FAILED', null, null, 'Auth', `Failed login attempt for email: ${email.toLowerCase().trim()}`, getClientIp(req));
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    throw err;
  }

  // Check if password matches
  const isMatch = await user.matchPassword(password);

  if (!isMatch) {
    logAudit('LOGIN_FAILED', user._id, user._id, 'Auth', `Failed login password mismatch for email: ${user.email}`, getClientIp(req));
    const err = new Error('Invalid credentials');
    err.statusCode = 401;
    throw err;
  }

  if (user.isDeleted) {
    const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'pranshuvramani@gmail.com';
    const err = new Error(`Account is deleted. Please contact super admin with mail id (${adminEmail}) to restore.`);
    err.statusCode = 403;
    throw err;
  }

  if (user.accountStatus !== 'Active') {
    const err = new Error(`Account is ${user.accountStatus}`);
    err.statusCode = 403;
    throw err;
  }

  if (user.isVerified === false) {
    const err = new Error('Email not verified. Please check your inbox to activate your account.');
    err.statusCode = 403;
    throw err;
  }

  if (user.requiresPasswordReset) {
    const err = new Error('Your administrator has forced a password reset. Please check your email or use the "Forgot Password" link to set a new password before logging in.');
    err.statusCode = 403;
    throw err;
  }

  logAudit('LOGIN_SUCCESS', user._id, user._id, 'Auth', `User "${user.name}" (${user.email}) logged in successfully`, getClientIp(req));

  sendTokenResponse(user, 200, res);
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  const user = await User.findById(req.user.id)
    .select('email name role labName parentAdminId accountStatus isVerified signatureUrl createdAt')
    .lean();
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

  const { email, labName, name, password, currentPassword } = req.body;

  if (
    (email && typeof email !== 'string') ||
    (labName && typeof labName !== 'string') ||
    (name && typeof name !== 'string') ||
    (password && typeof password !== 'string') ||
    (currentPassword && typeof currentPassword !== 'string')
  ) {
    return res.status(400).json({ success: false, error: 'Invalid input format' });
  }

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
    // Require current password verification to prevent session-hijack account takeover
    if (!currentPassword) {
      const err = new Error('Current password is required to set a new password');
      err.statusCode = 400;
      throw err;
    }
    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      const err = new Error('Current password is incorrect');
      err.statusCode = 401;
      throw err;
    }
    user.password = password;
    logAudit('PASSWORD_CHANGED', req.user.id, req.user.id, 'Auth', `User password changed`, getClientIp(req));
  }

  await user.save();

  // Invalidate auth cache after profile/password change
  invalidateAuthCache(req.user.id);

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
// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ success: false, error: 'Please provide a valid email address' });
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });

  if (user) {
    try {
      const resetToken = user.getResetPasswordToken();
      await user.save({ validateBeforeSave: false });

      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5500';
      const resetUrl = `${frontendUrl}/reset-password.html?token=${resetToken}`;

      await sendPasswordResetEmail(user.email, resetUrl);
    } catch (err) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });
      console.error('[AUTH] Email failed to send in forgotPassword:', err.message);
    }
  }

  // Uniform OWASP-compliant response to prevent User Enumeration attacks
  return res.status(200).json({
    success: true,
    message: 'If an account exists with that email address, a password reset link has been sent.'
  });
};

// @desc    Reset password with token
// @route   POST /api/auth/reset-password-with-token
// @access  Public
exports.resetPasswordWithToken = async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ success: false, error: 'Token and new password are required' });
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpire: { $gt: Date.now() }
  });

  if (!user) {
    const err = new Error('Invalid or expired password reset token');
    err.statusCode = 400;
    throw err;
  }

  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;

  // Implicitly verify the email since they successfully clicked a secure link sent to it
  user.isVerified = true;
  user.verificationToken = undefined;
  user.verificationExpire = undefined;
  user.requiresPasswordReset = false;

  // passwordChangedAt is automatically updated in the pre('save') hook
  await user.save();

  invalidateAuthCache(user._id);

  logAudit('PASSWORD_RESET', user._id, user._id, 'Auth', `Password reset via token for ${user.email}`, getClientIp(req));

  res.status(200).json({
    success: true,
    message: 'Password successfully updated. You can now log in.'
  });
};

// @desc    Verify Email
// @route   POST /api/auth/verify-email
// @access  Public
exports.verifyEmail = async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ success: false, error: 'Token is required' });
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  const user = await User.findOne({
    verificationToken: hashedToken,
    verificationTokenExpire: { $gt: Date.now() }
  });

  if (!user) {
    const err = new Error('Invalid or expired verification token');
    err.statusCode = 400;
    throw err;
  }

  if (user.isVerified) {
    // Idempotent success
    return sendTokenResponse(user, 200, res);
  }

  user.isVerified = true;
  // We clear the token to prevent any reuse after successful activation
  user.verificationToken = undefined;
  user.verificationTokenExpire = undefined;
  await user.save({ validateBeforeSave: false });

  sendTokenResponse(user, 200, res);
};

// @desc    Resend Email Verification
// @route   POST /api/auth/resend-verification
// @access  Public
exports.resendVerification = async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ success: false, error: 'Please provide a valid email' });
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() });

  if (user) {
    if (user.isVerified) {
      return res.status(200).json({ success: true, message: 'Account is already verified.' });
    }

    const verificationToken = user.getVerificationToken();
    await user.save({ validateBeforeSave: false });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5500';
    const verifyUrl = `${frontendUrl}/verify-email.html?token=${verificationToken}`;

    try {
      await sendVerificationEmail(user.email, verifyUrl);
    } catch (err) {
      console.error('Email failed to send', err);
    }
  }

  res.status(200).json({
    success: true,
    message: 'If an account exists, a verification email has been sent.'
  });
};

// @desc    Log user out / clear cookie
// @route   POST /api/auth/logout
// @access  Private
exports.logout = async (req, res) => {
  invalidateAuthCache(req.user.id);
  logAudit('LOGOUT', req.user.id, req.user.id, 'Auth', `User logged out`, getClientIp(req));

  res.cookie('lis_token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  });

  res.status(200).json({
    success: true,
    data: {}
  });
};

// Export shared helpers for staffController
module.exports.generateToken = generateToken;
module.exports.sendTokenResponse = sendTokenResponse;

// @desc    Setup initial Super Admin
// @route   POST /api/auth/setup-superadmin
// @access  Public
exports.setupSuperAdmin = async (req, res) => {
  const { email, password, name, secretCode } = req.body;

  if (typeof email !== 'string' || typeof password !== 'string' || typeof name !== 'string' || typeof secretCode !== 'string') {
    return res.status(400).json({ success: false, error: 'Invalid input format' });
  }

  if (secretCode !== process.env.SUPER_ADMIN_SECRET) {
    return res.status(401).json({ success: false, error: 'Invalid secret code' });
  }

  const superAdminExists = await User.findOne({ role: 'SuperAdmin' });
  if (superAdminExists) {
    return res.status(400).json({ success: false, error: 'Super Admin is already registered' });
  }

  const userExists = await User.findOne({ email: email.toLowerCase().trim() });
  if (userExists) {
    return res.status(400).json({ success: false, error: 'Email already exists' });
  }

  const user = await User.create({
    email: email.toLowerCase().trim(),
    name: name.trim(),
    password,
    role: 'SuperAdmin',
    accountStatus: 'Active'
  });

  sendTokenResponse(user, 201, res);
};

// @desc    Soft Delete Lab (Wait 30 Days)
// @route   DELETE /api/auth/delete-lab
// @access  Private (Admin only)
exports.deleteLab = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { reason } = req.body;

    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'Admin') {
      return res.status(404).json({ success: false, error: 'Admin not found' });
    }

    // Soft delete admin
    admin.isDeleted = true;
    admin.deletedAt = new Date();
    admin.deletionReason = reason || 'No reason provided';
    await admin.save();

    // Cascade soft delete to all staff accounts
    const staffUsers = await User.find({ parentAdminId: adminId }).select('_id');
    await User.updateMany(
      { parentAdminId: adminId },
      { $set: { isDeleted: true, deletedAt: new Date() } }
    );

    // Invalidate auth cache for admin + all staff
    invalidateAuthCache(adminId);
    staffUsers.forEach(s => invalidateAuthCache(s._id));

    res.cookie('lis_token', 'none', {
      expires: new Date(Date.now() + 10 * 1000),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    res.status(200).json({ success: true, message: 'Lab scheduled for permanent deletion in 30 days.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
