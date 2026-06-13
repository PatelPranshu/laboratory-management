const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  getPatients,
  getPatient,
  createPatient,
  updatePatient,
  deletePatient
} = require('../controllers/patientController');

const { protect, authorize } = require('../middlewares/authMiddleware');
const { validateObjectId } = require('../middlewares/validate');

const router = express.Router();

const createPatientLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 patient creations per `window` (here, per 15 minutes)
  message: { success: false, error: 'Too many patients created from this IP, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.route('/')
  .get(protect, getPatients)
  .post(protect, createPatientLimiter, createPatient);

router.route('/:id')
  .get(protect, validateObjectId, getPatient)
  .put(protect, validateObjectId, updatePatient)
  .delete(protect, validateObjectId, authorize('Admin'), deletePatient);

module.exports = router;
