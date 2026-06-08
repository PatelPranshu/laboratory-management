const express = require('express');
const {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  generateShare,
  getActiveShares,
  revokeShare,
  previewShare,
  importShare
} = require('../controllers/templateController');

const { protect, authorize } = require('../middlewares/authMiddleware');
const { validateObjectId } = require('../middlewares/validate');

const router = express.Router();

// Share routes MUST come before /:id routes
router.post('/share/generate', protect, authorize('Admin', 'Doctor'), generateShare);
router.get('/share/active', protect, authorize('Admin', 'Doctor'), getActiveShares);
router.get('/share/preview/:code', protect, authorize('Admin', 'Doctor'), previewShare);
router.post('/share/import', protect, authorize('Admin', 'Doctor'), importShare);
router.delete('/share/:id', protect, validateObjectId, authorize('Admin', 'Doctor'), revokeShare);

router.route('/')
  .get(protect, getTemplates)
  .post(protect, authorize('Admin', 'Doctor'), createTemplate);

router.route('/:id')
  .get(protect, validateObjectId, getTemplate)
  .put(protect, validateObjectId, authorize('Admin', 'Doctor'), updateTemplate)
  .delete(protect, validateObjectId, authorize('Admin', 'Doctor'), deleteTemplate);

module.exports = router;
