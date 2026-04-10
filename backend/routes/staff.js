const express = require('express');
const {
  inviteStaff,
  verifyInvite,
  completeRegistration,
  createTech,
  getStaff
} = require('../controllers/staffController');
const { protect, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/invite', protect, authorize('Admin'), inviteStaff);
router.post('/create-tech', protect, authorize('Admin'), createTech);
router.get('/', protect, authorize('Admin'), getStaff);

// Public routes for onboarding
router.get('/verify-invite/:token', verifyInvite);
router.post('/complete-registration', completeRegistration);

module.exports = router;
