const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Invitation = require('../models/Invitation');
const PrintSettings = require('../models/PrintSettings');
const jwt = require('jsonwebtoken');
const { sendInvitationEmail } = require('../services/emailService');
const { sendNotification } = require('../utils/notifier');

// Generate JWT Helper
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role, parentAdminId: user.parentAdminId, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// @desc    Invite Staff (Doctor/LabTech)
exports.inviteStaff = async (req, res) => {
  const { email, role } = req.body;

  if (!email || !role) {
    const err = new Error('Email and role are required');
    err.statusCode = 400;
    throw err;
  }

  if (!['Doctor', 'LabTech'].includes(role)) {
    const err = new Error('Invalid role');
    err.statusCode = 400;
    throw err;
  }

  const userExists = await User.findOne({ email: email.toLowerCase().trim() });
  if (userExists) {
    const err = new Error('User already exists');
    err.statusCode = 400;
    throw err;
  }

  // Delete existing unused invitations for this email to prevent spam
  await Invitation.deleteMany({ email: email.toLowerCase().trim() });

  // Generate secure token
  const token = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  await Invitation.create({
    email: email.toLowerCase().trim(),
    role,
    token: hashedToken,
    parentAdminId: req.user.id
  });

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5500';
  const inviteLink = `${frontendUrl}/register-staff.html?token=${token}`;

  try {
    await sendInvitationEmail(email, role, inviteLink);
    // Ensure we immediately notify the admin
    res.status(200).json({ success: true, message: 'Invitation email successfully sent!' });
  } catch (emailError) {
    console.error(`[STAFF] Email delivery failed for invitation to ${email}. Invitation is still valid in DB.`);
    res.status(200).json({ 
      success: true, 
      message: 'Invitation generated successfully, but the automatic email failed to send. You may share the link manually.',
      warning: 'Email delivery failed'
    });
  }
};

// @desc    Verify Invitation Token
exports.verifyInvite = async (req, res) => {
  const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

  const invitation = await Invitation.findOne({ token: hashedToken });
  if (!invitation) {
    const err = new Error('Invitation is invalid or has expired');
    err.statusCode = 404;
    throw err;
  }

  res.status(200).json({
    success: true,
    data: {
      email: invitation.email,
      role: invitation.role
    }
  });
};

// @desc    Complete Registration via Invitation
exports.completeRegistration = async (req, res) => {
  const { token, password, name, signatureUrl } = req.body;

  if (!token || !password || !name) {
    const err = new Error('Name, password, and token are required');
    err.statusCode = 400;
    throw err;
  }

  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  const invitation = await Invitation.findOne({ token: hashedToken });
  
  if (!invitation) {
    const err = new Error('Invitation is invalid or has expired');
    err.statusCode = 404;
    throw err;
  }

  // Double check email isn't already used
  const userExists = await User.findOne({ email: invitation.email });
  if (userExists) {
    const err = new Error('Email already registered');
    err.statusCode = 400;
    throw err;
  }

  // Get Admin's labName
  const admin = await User.findById(invitation.parentAdminId);
  if (!admin || admin.role !== 'Admin') {
     const err = new Error('Invalid lab environment');
     err.statusCode = 400;
     throw err;
  }

  const userFields = {
    email: invitation.email,
    name: name.trim(),
    password,
    role: invitation.role,
    labName: admin.labName,
    parentAdminId: admin._id,
    accountStatus: 'Active',
    mustChangePassword: false
  };

  if (invitation.role === 'Doctor' && signatureUrl) {
    userFields.signatureUrl = signatureUrl;
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const users = await User.create([userFields], { session });
    const user = users[0];
    await invitation.deleteOne({ session }); // Remove token once used

    // Notify lab team about new staff
    await sendNotification(user._id, admin._id, {
      type: 'NEW_STAFF',
      title: 'New Staff Member',
      message: `${user.name} has joined the lab as a ${user.role}.`,
      referenceId: user._id
    }, session);

    await session.commitTransaction();
    session.endSession();

    const tokenAuth = generateToken(user);
    const options = {
      expires: new Date(Date.now() + 8 * 60 * 60 * 1000),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
    };

    res.status(201).cookie('lis_token', tokenAuth, options).json({
      success: true,
      token: tokenAuth,
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
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

// @desc    Directly Create Lab Technician
exports.createTech = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    const err = new Error('Name, email, and password are required');
    err.statusCode = 400;
    throw err;
  }

  const userExists = await User.findOne({ email: email.toLowerCase().trim() });
  if (userExists) {
    const err = new Error('User already exists');
    err.statusCode = 400;
    throw err;
  }

  const admin = await User.findById(req.user.id);
  
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const users = await User.create([{
      email: email.toLowerCase().trim(),
      name: name.trim(),
      password: password, // They must change this later
      role: 'LabTech',
      labName: admin.labName,
      parentAdminId: admin._id,
      accountStatus: 'Active',
      mustChangePassword: true // Emphasize this directly!
    }], { session });

    const user = users[0];

    // Notify lab team about new tech
    await sendNotification(req.user.id, admin._id, {
      type: 'NEW_STAFF',
      title: 'New Technician Added',
      message: `${user.name} was added as a Lab Technician.`,
      referenceId: user._id
    }, session);

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      success: true,
      data: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

// @desc    Get all staff for this admin
exports.getStaff = async (req, res) => {
  const staff = await User.find({ parentAdminId: req.user.id })
    .select('-password')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    count: staff.length,
    data: staff
  });
};

// @desc    Remove Staff Member
exports.removeStaff = async (req, res) => {
  const staffMember = await User.findById(req.params.id);
  if (!staffMember) {
    const err = new Error('Staff member not found');
    err.statusCode = 404;
    throw err;
  }

  if (staffMember.parentAdminId.toString() !== req.user.id) {
    const err = new Error('Not authorized to delete this staff member');
    err.statusCode = 403;
    throw err;
  }

  if (staffMember._id.toString() === req.user.id) {
    const err = new Error('Cannot delete your own admin account');
    err.statusCode = 400;
    throw err;
  }

  await staffMember.deleteOne();
  res.status(200).json({ success: true, data: {} });
};

// @desc    Reset Staff Password
exports.resetPassword = async (req, res) => {
  const { password } = req.body;
  if (!password) {
    const err = new Error('Please provide a new password');
    err.statusCode = 400;
    throw err;
  }

  const staffMember = await User.findById(req.params.id);
  if (!staffMember) {
    const err = new Error('Staff member not found');
    err.statusCode = 404;
    throw err;
  }

  if (staffMember.parentAdminId.toString() !== req.user.id) {
    const err = new Error('Not authorized to reset password for this staff member');
    err.statusCode = 403;
    throw err;
  }

  staffMember.password = password;
  staffMember.mustChangePassword = true; 
  await staffMember.save();

  res.status(200).json({ success: true, message: 'Password reset successfully' });
};
