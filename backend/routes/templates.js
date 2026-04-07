const express = require('express');
const {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate
} = require('../controllers/templateController');

const { protect, authorize } = require('../middlewares/authMiddleware');
const { validateObjectId } = require('../middlewares/validate');

const router = express.Router();

router.route('/')
  .get(protect, getTemplates)
  .post(protect, authorize('Doctor'), createTemplate);

router.route('/:id')
  .get(protect, validateObjectId, getTemplate)
  .put(protect, validateObjectId, authorize('Doctor'), updateTemplate)
  .delete(protect, validateObjectId, authorize('Doctor'), deleteTemplate);

module.exports = router;
