const User = require('../models/User');
const OTPAuth = require('otpauth');
const QRCode = require('qrcode');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { sendTokenResponse } = require('./authController');
const { logAudit, getClientIp } = require('../middlewares/auditMiddleware');

/**
 * Creates an OTPAuth TOTP instance for a user
 */
const createTOTP = (email, secretBase32) => {
  return new OTPAuth.TOTP({
    issuer: 'MyPathoLabs',
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: secretBase32 ? OTPAuth.Secret.fromBase32(secretBase32) : new OTPAuth.Secret({ size: 20 })
  });
};

/**
 * Generates 8 plaintext backup codes (8 alphanumeric uppercase chars each)
 */
const generateBackupCodes = () => {
  const codes = [];
  for (let i = 0; i < 8; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(code);
  }
  return codes;
};

// @desc    Initiate MFA Setup (generate TOTP secret, QR Code, and backup codes)
// @route   POST /api/mfa/setup
// @access  Private
exports.setupMFA = async (req, res) => {
  const user = await User.findById(req.user.id).select('+mfa.secret');
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  // Create new secret
  const totp = createTOTP(user.email);
  const secretBase32 = totp.secret.base32;
  const otpauthUrl = totp.toString();

  // Generate QR code Data URL
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  // Generate 8 plaintext backup codes for user to download/print
  const plainBackupCodes = generateBackupCodes();

  // Hash backup codes before saving
  const hashedBackupCodes = await Promise.all(
    plainBackupCodes.map(async (code) => {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(code, salt);
      return { codeHash: hash, used: false };
    })
  );

  // Save secret temporarily (not enabled until verified)
  user.mfa = user.mfa || {};
  user.mfa.secret = secretBase32;
  user.mfa.backupCodes = hashedBackupCodes;
  await user.save();

  logAudit('MFA_SETUP_INITIATED', user._id, user._id, 'Auth', `MFA setup initiated for user ${user.email}`, getClientIp(req));

  res.status(200).json({
    success: true,
    data: {
      qrCode: qrCodeDataUrl,
      secret: secretBase32,
      backupCodes: plainBackupCodes
    }
  });
};

// @desc    Verify initial TOTP code to confirm & enable MFA
// @route   POST /api/mfa/verify-setup
// @access  Private
exports.verifySetup = async (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== 'string' || code.trim().length !== 6) {
    return res.status(400).json({ success: false, error: 'Please provide a valid 6-digit TOTP code' });
  }

  const user = await User.findById(req.user.id).select('+mfa.secret');
  if (!user || !user.mfa || !user.mfa.secret) {
    return res.status(400).json({ success: false, error: 'MFA setup has not been initiated' });
  }

  const totp = createTOTP(user.email, user.mfa.secret);
  const delta = totp.validate({ token: code.trim(), window: 1 });

  if (delta === null) {
    return res.status(400).json({ success: false, error: 'Invalid verification code. Please try again.' });
  }

  user.mfa.enabled = true;
  user.mfa.enabledAt = new Date();
  await user.save();

  logAudit('MFA_ENABLED', user._id, user._id, 'Auth', `MFA successfully enabled for user ${user.email}`, getClientIp(req));

  res.status(200).json({
    success: true,
    message: 'Multi-Factor Authentication enabled successfully!'
  });
};

// @desc    Verify TOTP code or Backup Code during Login (Step 2)
// @route   POST /api/mfa/verify-login
// @access  Public (Requires mfaToken)
exports.verifyLogin = async (req, res) => {
  const { mfaToken, code, isBackup } = req.body;

  if (!mfaToken || !code) {
    return res.status(400).json({ success: false, error: 'MFA token and verification code are required' });
  }

  let decoded;
  try {
    decoded = jwt.verify(mfaToken, process.env.JWT_SECRET);
    if (decoded.type !== 'mfa_step') {
      return res.status(401).json({ success: false, error: 'Invalid MFA token type' });
    }
  } catch (err) {
    return res.status(401).json({ success: false, error: 'MFA token has expired or is invalid. Please log in again.' });
  }

  const user = await User.findById(decoded.id).select('+password +mfa.secret +mfa.backupCodes');
  if (!user) {
    return res.status(401).json({ success: false, error: 'User no longer exists' });
  }

  const cleanCode = String(code).trim();

  // If using backup code
  if (isBackup) {
    const backupCodes = user.mfa?.backupCodes || [];
    let matchedIndex = -1;

    for (let i = 0; i < backupCodes.length; i++) {
      const entry = backupCodes[i];
      if (!entry.used) {
        const isMatch = await bcrypt.compare(cleanCode.toUpperCase(), entry.codeHash);
        if (isMatch) {
          matchedIndex = i;
          break;
        }
      }
    }

    if (matchedIndex === -1) {
      logAudit('LOGIN_MFA_FAILED', user._id, user._id, 'Auth', `Invalid backup code attempt for ${user.email}`, getClientIp(req));
      return res.status(400).json({ success: false, error: 'Invalid or already used backup code' });
    }

    // Mark backup code as used
    user.mfa.backupCodes[matchedIndex].used = true;
    user.mfa.backupCodes[matchedIndex].usedAt = new Date();
    user.mfa.lastUsedAt = new Date();
    await user.save();

    logAudit('MFA_BACKUP_USED', user._id, user._id, 'Auth', `Backup code used for MFA login by ${user.email}`, getClientIp(req));
    logAudit('LOGIN_MFA_SUCCESS', user._id, user._id, 'Auth', `MFA step-up login successful via backup code for ${user.email}`, getClientIp(req));

    return sendTokenResponse(user, 200, res);
  }

  // Standard TOTP Verification
  if (!user.mfa || !user.mfa.secret) {
    return res.status(400).json({ success: false, error: 'MFA is not configured for this account' });
  }

  const totp = createTOTP(user.email, user.mfa.secret);
  const delta = totp.validate({ token: cleanCode, window: 1 });

  if (delta === null) {
    logAudit('LOGIN_MFA_FAILED', user._id, user._id, 'Auth', `Invalid TOTP code attempt for ${user.email}`, getClientIp(req));
    return res.status(400).json({ success: false, error: 'Invalid TOTP code. Please check your authenticator app.' });
  }

  user.mfa.lastUsedAt = new Date();
  await user.save();

  logAudit('LOGIN_MFA_SUCCESS', user._id, user._id, 'Auth', `MFA step-up login successful for ${user.email}`, getClientIp(req));

  sendTokenResponse(user, 200, res);
};

// @desc    Disable MFA (Requires password + TOTP confirmation)
// @route   POST /api/mfa/disable
// @access  Private
exports.disableMFA = async (req, res) => {
  const { password, code } = req.body;

  if (!password || !code) {
    return res.status(400).json({ success: false, error: 'Password and 6-digit TOTP code are required to disable MFA' });
  }

  const user = await User.findById(req.user.id).select('+password +mfa.secret');
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  // Verify password
  const isMatch = await user.matchPassword(password);
  if (!isMatch) {
    return res.status(401).json({ success: false, error: 'Incorrect password' });
  }

  // Verify TOTP
  if (user.mfa && user.mfa.secret) {
    const totp = createTOTP(user.email, user.mfa.secret);
    const delta = totp.validate({ token: String(code).trim(), window: 1 });
    if (delta === null) {
      return res.status(400).json({ success: false, error: 'Invalid TOTP code' });
    }
  }

  // Disable MFA
  user.mfa.enabled = false;
  user.mfa.secret = undefined;
  user.mfa.backupCodes = [];
  await user.save();

  logAudit('MFA_DISABLED', user._id, user._id, 'Auth', `MFA disabled for user ${user.email}`, getClientIp(req));

  res.status(200).json({
    success: true,
    message: 'Multi-Factor Authentication has been disabled'
  });
};
