const express = require('express');
const {
  getPlatformStats,
  getAllLabs,
  updateLabStatus,
  restoreLab,
  toggleHoldDeletion,
  getLabDetails,
  updateLabStaff,
  removeLabStaff,
  getDeletionReasons,
  updateDeletionReasons
} = require('../controllers/superadminController');
const { protect, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);
router.use(authorize('SuperAdmin'));

router.get('/stats', getPlatformStats);
router.get('/labs', getAllLabs);
router.get('/labs/:id/details', getLabDetails);
router.put('/labs/:id/status', updateLabStatus);
router.put('/labs/:id/restore', restoreLab);
router.put('/labs/:id/hold', toggleHoldDeletion);
router.put('/labs/:id/staff/:staffId', updateLabStaff);
router.delete('/labs/:id/staff/:staffId', removeLabStaff);

// Settings
router.get('/settings/deletion-reasons', getDeletionReasons);
router.put('/settings/deletion-reasons', updateDeletionReasons);

module.exports = router;
