const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  setupMFA,
  verifySetup,
  verifyLogin,
  disableMFA
} = require('../controllers/mfaController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

// Strict rate limiter for MFA verifications (5 attempts per 15 mins)
const mfaVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { success: false, error: 'Too many MFA verification attempts. Please try again after 15 minutes.' }
});

router.post('/setup', protect, setupMFA);
router.post('/verify-setup', protect, mfaVerifyLimiter, verifySetup);
router.post('/verify-login', mfaVerifyLimiter, verifyLogin);
router.post('/disable', protect, disableMFA);

module.exports = router;
