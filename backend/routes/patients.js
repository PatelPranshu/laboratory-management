const express = require('express');
const { z } = require('zod');
const rateLimit = require('express-rate-limit');
const {
  getPatients,
  getPatient,
  createPatient,
  updatePatient,
  deletePatient,
  lookupPatient,
  importPatient
} = require('../controllers/patientController');

const { protect, authorize } = require('../middlewares/authMiddleware');
const { validateObjectId, validateSchema } = require('../middlewares/validate');

const router = express.Router();

const patientSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional().or(z.literal('')),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  age: z.number().or(z.string()).refine(val => val !== '', 'Age is required'),
  ageUnit: z.string().optional().or(z.literal('')),
  gender: z.string().min(1, 'Gender is required'),
  address: z.string().optional().or(z.literal('')),
  weight: z.number().or(z.string()).optional().or(z.literal('')),
  height: z.number().or(z.string()).optional().or(z.literal(''))
});

const createPatientLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, 
  message: { success: false, error: 'Too many patients created from this IP, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.route('/')
  .get(protect, getPatients)
  .post(protect, createPatientLimiter, validateSchema(patientSchema), createPatient);

router.route('/:id')
  .get(protect, validateObjectId, getPatient)
  .put(protect, validateObjectId, validateSchema(patientSchema.partial()), updatePatient)
  .delete(protect, validateObjectId, authorize('Admin'), deletePatient);

// Cross-lab patient lookup (read-only, no rate limit needed)
router.get('/:id/lookup', protect, validateObjectId, lookupPatient);

// Cross-lab patient import — enterprise-grade rate limiting
const importPatientLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // strict: 5 imports per 15 minutes per IP
  message: { success: false, error: 'Too many import requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
router.post('/:id/import', protect, validateObjectId, importPatientLimiter, importPatient);

module.exports = router;
