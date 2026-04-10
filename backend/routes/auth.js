const express = require('express');
const { register, login, getMe, updateProfile, resetPassword } = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.put('/profile', protect, updateProfile);
router.post('/reset-password', protect, resetPassword);

module.exports = router;
