const express = require('express');
const { z } = require('zod');
const { register, login, getMe, updateProfile, resetPassword } = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');
const { validateSchema, passwordSchema } = require('../middlewares/validate');

const router = express.Router();

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
  })
});

const resetPasswordSchema = z.object({
  newPassword: passwordSchema
});

router.post('/register', validateSchema(registerSchema), register);
router.post('/login', validateSchema(loginSchema), login);
router.get('/me', protect, getMe);
router.put('/profile', protect, validateSchema(profileSchema), updateProfile);
router.post('/reset-password', protect, validateSchema(resetPasswordSchema), resetPassword);

module.exports = router;
