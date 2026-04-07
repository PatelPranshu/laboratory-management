const express = require('express');
const {
  getPatients,
  getPatient,
  createPatient,
  updatePatient,
  deletePatient
} = require('../controllers/patientController');

const { protect } = require('../middlewares/authMiddleware');
const { validateObjectId } = require('../middlewares/validate');

const router = express.Router();

router.route('/')
  .get(protect, getPatients)
  .post(protect, createPatient);

router.route('/:id')
  .get(protect, validateObjectId, getPatient)
  .put(protect, validateObjectId, updatePatient)
  .delete(protect, validateObjectId, deletePatient);

module.exports = router;
