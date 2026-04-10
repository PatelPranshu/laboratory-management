const express = require('express');
const {
  getReports,
  getReport,
  createReport,
  updateReport,
  generatePdf,
  sendReport
} = require('../controllers/reportController');

const { protect, authorize } = require('../middlewares/authMiddleware');
const { validateObjectId } = require('../middlewares/validate');

const router = express.Router();

router.route('/')
  .get(protect, getReports)
  .post(protect, createReport);

router.route('/:id')
  .get(protect, validateObjectId, getReport)
  .put(protect, validateObjectId, updateReport);

router.get('/:id/pdf', protect, validateObjectId, authorize('Admin', 'Doctor'), generatePdf);
router.post('/:id/send', protect, validateObjectId, authorize('Admin', 'Doctor'), sendReport);

module.exports = router;
