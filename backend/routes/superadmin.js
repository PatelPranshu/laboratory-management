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
  updateDeletionReasons,
  getAuditLogs,
  exportLabsCsv,
  createAnnouncement,
  getAnnouncements,
  deleteAnnouncement,
  forceLogoutAll,
  forcePasswordReset,
  permanentDeleteLab
} = require('../controllers/superadminController');
const { protect, authorize } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);
router.use(authorize('SuperAdmin'));

// Dashboard
router.get('/stats', getPlatformStats);

// Lab Management
router.get('/labs', getAllLabs);
router.get('/labs/:id/details', getLabDetails);
router.put('/labs/:id/status', updateLabStatus);
router.put('/labs/:id/restore', restoreLab);
router.put('/labs/:id/hold', toggleHoldDeletion);
router.post('/labs/:id/force-logout', forceLogoutAll);
router.post('/labs/:id/force-password-reset', forcePasswordReset);
router.delete('/labs/:id/permanent', permanentDeleteLab);

// Staff Management
router.put('/labs/:id/staff/:staffId', updateLabStaff);
router.delete('/labs/:id/staff/:staffId', removeLabStaff);

// Audit Logs
router.get('/audit-logs', getAuditLogs);

// Data Export
router.get('/export/labs', exportLabsCsv);

// Announcements
router.post('/announcements', createAnnouncement);
router.get('/announcements', getAnnouncements);
router.delete('/announcements/:announcementId', deleteAnnouncement);

// Settings
router.get('/settings/deletion-reasons', getDeletionReasons);
router.put('/settings/deletion-reasons', updateDeletionReasons);

module.exports = router;
