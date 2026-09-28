const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Invitation = require('../models/Invitation');
const PrintSettings = require('../models/PrintSettings');
const Signature = require('../models/Signature');
const { deleteFromCloudinary } = require('../utils/cloudinary');
const { generateToken } = require('./authController');
const { sendInvitationEmail } = require('../services/emailService');
const { sendNotification } = require('../utils/notifier');
const { invalidateAuthCache } = require('../middlewares/authMiddleware');
const { logAudit, getClientIp } = require('../middlewares/auditMiddleware');

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');



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

  const labName = req.user.labName || 'MyPathoLabs Laboratory';
  const inviterName = req.user.name || 'Lab Administrator';

  logAudit('STAFF_INVITED', req.user.id, null, 'Staff',
    `Invited ${email.toLowerCase().trim()} as ${role}`,
    getClientIp(req)
  );

  try {
    await sendInvitationEmail(email, role, inviteLink, labName, inviterName);
    // Ensure we immediately notify the admin and provide link
    res.status(200).json({ success: true, message: 'Invitation email successfully sent!', inviteLink });
  } catch (emailError) {
    console.error(`[STAFF] Email delivery failed for invitation to ${email}. Invitation is still valid in DB.`);
    res.status(200).json({
      success: true,
      message: 'Invitation generated successfully, but the automatic email failed to send. You may share the link manually.',
      warning: 'Email delivery failed',
      inviteLink
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
  const { token, password, name, signatureUrl, termsAccepted, privacyAccepted } = req.body;

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
  const admin = await User.findById(invitation.parentAdminId).select('labName role');
  if (!admin || admin.role !== 'Admin') {
    const err = new Error('Invalid lab environment');
    err.statusCode = 400;
    throw err;
  }

  const clientIp = getClientIp(req);
  const userAgent = (req.headers['user-agent'] || '').slice(0, 200);

  const userFields = {
    email: invitation.email,
    name: name.trim(),
    password,
    role: invitation.role,
    labName: admin.labName,
    parentAdminId: admin._id,
    accountStatus: 'Active',
    consentLog: [
      { type: 'terms', version: '2.4.0', acceptedAt: new Date(), ipAddress: clientIp, userAgent },
      { type: 'privacy', version: '3.0.0', acceptedAt: new Date(), ipAddress: clientIp, userAgent }
    ]
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
    const expTimeMs = Date.now() + 8 * 60 * 60 * 1000;

    const isProduction = process.env.NODE_ENV === 'production';
    const options = {
      expires: new Date(expTimeMs),
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax'
    };

    res.status(201).cookie('lis_token', tokenAuth, options).json({
      success: true,
      token: tokenAuth,
      exp: Math.floor(expTimeMs / 1000),
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        labName: user.labName,
        parentAdminId: user.parentAdminId,
        accountStatus: user.accountStatus,
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
  const { search, role, status } = req.query;
  const filter = {
    parentAdminId: req.user.id,
    isDeleted: { $ne: true }
  };

  if (role && ['Doctor', 'LabTech'].includes(role)) {
    filter.role = role;
  }

  if (status && ['Active', 'Suspended', 'Pending'].includes(status)) {
    filter.accountStatus = status;
  }

  if (search && typeof search === 'string' && search.trim()) {
    const term = escapeRegex(search.trim());
    filter.$or = [
      { name: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } }
    ];
  }

  const staff = await User.find(filter)
    .select('-password')
    .sort({ createdAt: -1 })
    .lean();

  res.status(200).json({
    success: true,
    count: staff.length,
    data: staff
  });
};

// @desc    Get all pending invitations for this admin
exports.getInvitations = async (req, res) => {
  const invitations = await Invitation.find({ parentAdminId: req.user.id })
    .sort({ createdAt: -1 })
    .lean();

  const data = invitations.map(inv => {
    const createdAt = inv.createdAt ? new Date(inv.createdAt) : new Date();
    const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
    const isExpired = Date.now() > expiresAt.getTime();
    return {
      _id: inv._id,
      email: inv.email,
      role: inv.role,
      createdAt: inv.createdAt,
      expiresAt,
      isExpired
    };
  });

  res.status(200).json({
    success: true,
    count: data.length,
    data
  });
};

// @desc    Revoke/Cancel a pending invitation
exports.cancelInvitation = async (req, res) => {
  const invitation = await Invitation.findOneAndDelete({
    _id: req.params.id,
    parentAdminId: req.user.id
  });

  if (!invitation) {
    const err = new Error('Invitation not found or already processed');
    err.statusCode = 404;
    throw err;
  }

  logAudit('STAFF_INVITATION_REVOKED', req.user.id, null, 'Staff',
    `Revoked pending invitation for ${invitation.email} (${invitation.role})`,
    getClientIp(req)
  );

  res.status(200).json({ success: true, message: 'Invitation revoked successfully' });
};

// @desc    Resend invitation email
exports.resendInvitation = async (req, res) => {
  const invitation = await Invitation.findOne({
    _id: req.params.id,
    parentAdminId: req.user.id
  });

  if (!invitation) {
    const err = new Error('Invitation not found or has expired');
    err.statusCode = 404;
    throw err;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  invitation.token = hashedToken;
  invitation.createdAt = new Date();
  await invitation.save();

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5500';
  const inviteLink = `${frontendUrl}/register-staff.html?token=${token}`;
  const labName = req.user.labName || 'MyPathoLabs Laboratory';
  const inviterName = req.user.name || 'Lab Administrator';

  logAudit('STAFF_INVITATION_RESENT', req.user.id, null, 'Staff',
    `Resent invitation to ${invitation.email} (${invitation.role})`,
    getClientIp(req)
  );

  try {
    await sendInvitationEmail(invitation.email, invitation.role, inviteLink, labName, inviterName);
    res.status(200).json({ success: true, message: 'Invitation email resent successfully!', inviteLink });
  } catch (emailError) {
    res.status(200).json({
      success: true,
      message: 'Invitation refreshed, but automatic email failed to send. You may share the link manually.',
      warning: 'Email delivery failed',
      inviteLink
    });
  }
};

// @desc    Update Staff Member (Name, Role, Account Status)
exports.updateStaff = async (req, res) => {
  const { name, role, accountStatus } = req.body;
  const staff = await User.findOne({
    _id: req.params.id,
    parentAdminId: req.user.id,
    isDeleted: { $ne: true }
  });

  if (!staff) {
    const err = new Error('Staff member not found');
    err.statusCode = 404;
    throw err;
  }

  if (staff._id.toString() === req.user.id.toString()) {
    const err = new Error('Cannot modify root admin profile from staff settings');
    err.statusCode = 400;
    throw err;
  }

  const oldRole = staff.role;
  const oldStatus = staff.accountStatus;

  if (name && typeof name === 'string') {
    staff.name = name.trim();
  }

  if (role && ['Doctor', 'LabTech'].includes(role)) {
    staff.role = role;
  }

  if (accountStatus && ['Active', 'Suspended'].includes(accountStatus)) {
    staff.accountStatus = accountStatus;
    if (accountStatus === 'Suspended') {
      invalidateAuthCache(staff._id);
    }
  }

  await staff.save();

  if (role && role !== oldRole) {
    logAudit('STAFF_ROLE_CHANGED', req.user.id, staff._id, 'Staff',
      `Staff "${staff.name}" (${staff.email}) role changed from ${oldRole} to ${role}`,
      getClientIp(req)
    );
  }

  if (accountStatus && accountStatus !== oldStatus) {
    logAudit('STAFF_STATUS_CHANGED', req.user.id, staff._id, 'Staff',
      `Staff "${staff.name}" (${staff.email}) status changed from ${oldStatus} to ${accountStatus}`,
      getClientIp(req)
    );
  }

  res.status(200).json({
    success: true,
    message: 'Staff updated successfully',
    data: {
      _id: staff._id,
      name: staff.name,
      email: staff.email,
      role: staff.role,
      accountStatus: staff.accountStatus
    }
  });
};

// @desc    Remove Staff Member (HIPAA Soft-delete preserving medical audit trail)
exports.removeStaff = async (req, res) => {
  const staffMember = await User.findOne({
    _id: req.params.id,
    parentAdminId: req.user.id,
    isDeleted: { $ne: true }
  });

  if (!staffMember) {
    const err = new Error('Staff member not found');
    err.statusCode = 404;
    throw err;
  }

  if (staffMember._id.toString() === req.user.id.toString()) {
    const err = new Error('Cannot delete your own admin account');
    err.statusCode = 400;
    throw err;
  }

  // Soft delete preserves references in historical patient reports/signatures
  staffMember.isDeleted = true;
  staffMember.deletedAt = new Date();
  staffMember.accountStatus = 'Suspended';
  await staffMember.save();

  invalidateAuthCache(staffMember._id);

  logAudit('STAFF_REMOVED', req.user.id, staffMember._id, 'Staff',
    `Staff "${staffMember.name}" (${staffMember.email}) soft-deleted by lab admin`,
    getClientIp(req)
  );

  res.status(200).json({ success: true, message: 'Staff member removed successfully' });
};


