const express = require('express');
const { z } = require('zod');
const {
  inviteStaff,
  verifyInvite,
  completeRegistration,
  createTech,
  getStaff,
  removeStaff,
  resetPassword
} = require('../controllers/staffController');
const { protect, authorize } = require('../middlewares/authMiddleware');
const { validateSchema, passwordSchema } = require('../middlewares/validate');

const router = express.Router();

router.post('/invite', protect, authorize('Admin'), inviteStaff);
router.post('/create-tech', protect, authorize('Admin'), createTech);
router.get('/', protect, authorize('Admin'), getStaff);
router.delete('/:id', protect, authorize('Admin'), removeStaff);
router.put('/:id/reset-password', protect, authorize('Admin'), resetPassword);

// Public routes for onboarding
router.get('/verify-invite/:token', verifyInvite);

const completeRegistrationSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: passwordSchema,
  name: z.string().min(1, 'Name is required'),
  signatureUrl: z.string().optional()
});
router.post('/complete-registration', validateSchema(completeRegistrationSchema), completeRegistration);

module.exports = router;
