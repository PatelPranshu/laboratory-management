const express = require('express');
const { z } = require('zod');
const { 
  register, login, getMe, updateProfile, 
  forgotPassword, resetPasswordWithToken, 
  verifyEmail, resendVerification,
  logout, setupSuperAdmin, deleteLab 
} = require('../controllers/authController');
const { getDeletionReasons } = require('../controllers/superadminController');
const { protect, authorize } = require('../middlewares/authMiddleware');
const { validateSchema, passwordSchema } = require('../middlewares/validate');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Specific rate limiters for abuse-prone endpoints
const strictAuthLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 5, // Limit each IP to 5 requests per windowMs
  message: { success: false, error: 'Too many requests, please try again after an hour' }
});

const registerSchema = z.object({
  email: z.string().email('Please provide a valid email address'),
  password: passwordSchema,
  role: z.string().optional(),
  labName: z.string().min(1, 'Lab name is required'),
  name: z.string().min(1, 'Name is required'),
  parentAdminId: z.string().optional()
});

const loginSchema = z.object({
  email: z.string().email('Please provide a valid email'),
  password: z.string().min(1, 'Please provide a password')
});

const profileSchema = z.object({
  email: z.string().email('Please provide a valid email address').optional(),
  labName: z.string().optional(),
  name: z.string().optional(),
  password: z.string().optional().refine(val => !val || passwordSchema.safeParse(val).success, {
    message: 'Password must be at least 8 characters with at least 1 uppercase letter, 1 number, and 1 special character'
  }),
  currentPassword: z.string().optional()
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Please provide a valid email address')
});

const resetPasswordWithTokenSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: passwordSchema
});

const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token is required')
});

const resendVerificationSchema = z.object({
  email: z.string().email('Please provide a valid email address')
});

// Authentication Routes
router.post('/register', validateSchema(registerSchema), register);
router.post('/login', validateSchema(loginSchema), login);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.put('/profile', protect, validateSchema(profileSchema), updateProfile);

// Password Reset Flows
router.post('/forgot-password', strictAuthLimiter, validateSchema(forgotPasswordSchema), forgotPassword);
router.post('/reset-password-with-token', validateSchema(resetPasswordWithTokenSchema), resetPasswordWithToken);

// Email Verification Flows
router.post('/verify-email', validateSchema(verifyEmailSchema), verifyEmail);
router.post('/resend-verification', strictAuthLimiter, validateSchema(resendVerificationSchema), resendVerification);

// SuperAdmin & Lab Management
router.post('/setup-superadmin', setupSuperAdmin);
router.get('/deletion-reasons', protect, getDeletionReasons);
router.delete('/delete-lab', protect, authorize('Admin'), deleteLab);

module.exports = router;
