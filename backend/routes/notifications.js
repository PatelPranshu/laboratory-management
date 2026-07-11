const express = require('express');
const router = express.Router();
const { getNotifications, markAsRead, markAllAsRead, getUnreadAnnouncements, dismissAnnouncement } = require('../controllers/notificationController');
const { protect } = require('../middlewares/authMiddleware');

router.use(protect);

router.get('/', getNotifications);
router.put('/read/:id', markAsRead);
router.put('/read-all', markAllAsRead);

router.get('/announcements/unread', getUnreadAnnouncements);
router.post('/announcements/:id/dismiss', dismissAnnouncement);

module.exports = router;
