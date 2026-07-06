const express = require('express');
const {
  getReports,
  getReport,
  createReport,
  updateReport,
  generatePdf,
  sendReport,
  getPendingReports,
  deleteReport
} = require('../controllers/reportController');

const { protect, authorize } = require('../middlewares/authMiddleware');
const { validateObjectId } = require('../middlewares/validate');
const rateLimit = require('express-rate-limit');

// Strict rate limiting for PDF generation (heavy RAM usage)
const pdfLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 5, // limit each IP to 5 PDF generation requests per windowMs
  message: { success: false, error: 'Too many PDF requests, please try again in a minute' }
});

const router = express.Router();

router.route('/')
  .get(protect, getReports)
  .post(protect, authorize('Admin', 'Doctor', 'LabTech'), createReport);

router.get('/pending', protect, getPendingReports);

router.route('/:id')
  .get(protect, validateObjectId, getReport)
  .put(protect, validateObjectId, authorize('Admin', 'Doctor', 'LabTech'), updateReport)
  .delete(protect, validateObjectId, authorize('Admin'), deleteReport);

router.get('/:id/pdf', protect, validateObjectId, pdfLimiter, authorize('Admin', 'Doctor', 'LabTech'), generatePdf);
router.post('/:id/send', protect, validateObjectId, authorize('Admin', 'Doctor', 'LabTech'), sendReport);

module.exports = router;
