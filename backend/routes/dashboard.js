const express = require('express');
const { getSummary, syncStats } = require('../controllers/dashboardController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get('/summary', protect, getSummary);
router.post('/sync-stats', protect, syncStats);

module.exports = router;
