const express = require('express');
const { getSummary, syncStats } = require('../controllers/dashboardController');
const { protect, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/summary', protect, getSummary);
router.post('/sync-stats', protect, authorize('Admin'), syncStats);

module.exports = router;
