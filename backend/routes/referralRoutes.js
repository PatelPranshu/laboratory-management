const express = require('express');
const {
  getReferrals,
  addReferral,
  deleteReferral
} = require('../controllers/referralController');
const { protect, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

router.route('/')
  .get(protect, getReferrals)
  .post(protect, authorize('Admin', 'Doctor'), addReferral);

router.delete('/:id', protect, authorize('Admin', 'Doctor'), deleteReferral);

module.exports = router;
