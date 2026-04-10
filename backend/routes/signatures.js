const express = require('express');
const {
  addSignature,
  getSignatures,
  deleteSignature
} = require('../controllers/signatureController');
const { protect, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/', protect, authorize('Admin', 'Doctor'), addSignature);
router.get('/', protect, getSignatures);
router.delete('/:id', protect, authorize('Admin'), deleteSignature);

module.exports = router;
