const express = require('express');
const {
  getReferrals,
  addReferral,
  deleteReferral
} = require('../controllers/referralController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.route('/')
  .get(protect, getReferrals)
  .post(protect, addReferral);

router.delete('/:id', protect, deleteReferral);

module.exports = router;
