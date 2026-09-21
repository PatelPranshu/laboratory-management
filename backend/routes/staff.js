const express = require('express');
const { z } = require('zod');
const {
  inviteStaff,
  verifyInvite,
  completeRegistration,
  getStaff,
  getInvitations,
  cancelInvitation,
  resendInvitation,
  updateStaff,
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

const updateStaffSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').max(50).optional(),
  role: z.enum(['Doctor', 'LabTech']).optional(),
  accountStatus: z.enum(['Active', 'Suspended']).optional()
});

router.post('/invite', protect, authorize('Admin'), inviteLimiter, inviteStaff);
router.get('/', protect, authorize('Admin'), getStaff);
router.get('/invitations', protect, authorize('Admin'), getInvitations);
router.delete('/invitations/:id', protect, authorize('Admin'), cancelInvitation);
router.post('/invitations/:id/resend', protect, authorize('Admin'), inviteLimiter, resendInvitation);
router.put('/:id', protect, authorize('Admin'), validateSchema(updateStaffSchema), updateStaff);
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
