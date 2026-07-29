const express = require('express');
const { z } = require('zod');
const {
  inviteStaff,
  verifyInvite,
  completeRegistration,
  getStaff,
  removeStaff
} = require('../controllers/staffController');
const { protect, authorize } = require('../middlewares/authMiddleware');
const { validateSchema, passwordSchema, complianceFlagSchema } = require('../middlewares/validate');

const rateLimit = require('express-rate-limit');

const router = express.Router();

// Strict rate limiting for staff invitations (10 requests per hour per IP)
const inviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many staff invitations sent, please try again after an hour' }
});

router.post('/invite', protect, authorize('Admin'), inviteLimiter, inviteStaff);
router.get('/', protect, authorize('Admin'), getStaff);
router.delete('/:id', protect, authorize('Admin'), removeStaff);

// Public routes for onboarding
router.get('/verify-invite/:token', verifyInvite);

const completeRegistrationSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: passwordSchema,
  name: z.string().min(1, 'Name is required'),
  signatureUrl: z.string().optional(),
  termsAccepted: complianceFlagSchema,
  privacyAccepted: complianceFlagSchema
});
router.post('/complete-registration', validateSchema(completeRegistrationSchema), completeRegistration);

module.exports = router;
