const crypto = require('crypto');
const User = require('../models/User');
const Invitation = require('../models/Invitation');
const PrintSettings = require('../models/PrintSettings');
const { isValidEmail, isStrongPassword } = require('../middlewares/validate');
const jwt = require('jsonwebtoken');
const { sendInvitationEmail } = require('../services/emailService');

// Generate JWT Helper
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: '7d'
  });
};

// @desc    Invite Staff (Doctor/LabTech)
// @route   POST /api/staff/invite
// @access  Private (Admin only)
exports.inviteStaff = async (req, res) => {
  try {
    const { email, role } = req.body;

    if (!email || !role) {
      return res.status(400).json({ success: false, error: 'Email and role are required' });
    }

    if (!['Doctor', 'LabTech'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Invalid role' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email address' });
    }

    // Check if user already exists
    const userExists = await User.findOne({ email: email.toLowerCase().trim() });
    if (userExists) {
      return res.status(400).json({ success: false, error: 'User already exists' });
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
      // If email delivery fails, the invite is still valid in the DB, so we inform the client.
      console.error(`[STAFF] Email delivery failed. Invitation still accessible via link: ${inviteLink}`);
      res.status(200).json({ 
        success: true, 
        message: 'Invitation generated successfully, but the automatic email failed to send. You may share the link manually.',
        warning: 'Email delivery failed'
      });
    }
  } catch (error) {
    console.error('inviteStaff error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to invite staff' });
  }
};

// @desc    Verify Invitation Token
// @route   GET /api/staff/verify-invite/:token
// @access  Public
exports.verifyInvite = async (req, res) => {
  try {
    const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

    const invitation = await Invitation.findOne({ token: hashedToken });
    if (!invitation) {
      return res.status(404).json({ success: false, error: 'Invitation is invalid or has expired' });
    }

    res.status(200).json({
      success: true,
      data: {
        email: invitation.email,
        role: invitation.role
      }
    });
  } catch (error) {
    console.error('verifyInvite error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to verify invitation' });
  }
};

// @desc    Complete Registration via Invitation
// @route   POST /api/staff/complete-registration
// @access  Public
exports.completeRegistration = async (req, res) => {
  try {
    const { token, password, name, signatureUrl } = req.body;

    if (!token || !password || !name) {
      return res.status(400).json({ success: false, error: 'Name, password, and token are required' });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters with at least 1 uppercase letter and 1 number'
      });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const invitation = await Invitation.findOne({ token: hashedToken });
    
    if (!invitation) {
      return res.status(404).json({ success: false, error: 'Invitation is invalid or has expired' });
    }

    // Double check email isn't already used
    const userExists = await User.findOne({ email: invitation.email });
    if (userExists) {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }

    // Get Admin's labName
    const admin = await User.findById(invitation.parentAdminId);
    if (!admin || admin.role !== 'Admin') {
       return res.status(400).json({ success: false, error: 'Invalid lab environment' });
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

    const user = await User.create(userFields);
    await invitation.deleteOne(); // Remove token once used

    res.status(201).json({
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
    console.error('completeRegistration error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to complete registration' });
  }
};

// @desc    Directly Create Lab Technician
// @route   POST /api/staff/create-tech
// @access  Private (Admin only)
exports.createTech = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email, and password are required' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email address' });
    }

    const userExists = await User.findOne({ email: email.toLowerCase().trim() });
    if (userExists) {
      return res.status(400).json({ success: false, error: 'User already exists' });
    }

    const admin = await User.findById(req.user.id);
    
    const user = await User.create({
      email: email.toLowerCase().trim(),
      name: name.trim(),
      password: password, // They must change this later
      role: 'LabTech',
      labName: admin.labName,
      parentAdminId: admin._id,
      accountStatus: 'Active',
      mustChangePassword: true // Emphasize this directly!
    });

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
    console.error('createTech error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to create technician' });
  }
};

// @desc    Get all staff for this admin
// @route   GET /api/staff
// @access  Private (Admin only)
exports.getStaff = async (req, res) => {
  try {
    const staff = await User.find({ parentAdminId: req.user.id })
      .select('-password')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: staff.length,
      data: staff
    });
  } catch (error) {
    console.error('getStaff error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to get staff list' });
  }
};
