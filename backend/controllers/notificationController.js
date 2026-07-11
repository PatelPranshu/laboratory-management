const Notification = require('../models/Notification');

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
exports.getNotifications = async (req, res) => {
    const limit = parseInt(req.query.limit, 10) || 50;
    
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ recipientId: req.user.id })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      Notification.countDocuments({ recipientId: req.user.id, isRead: false })
    ]);

    res.status(200).json({ success: true, count: notifications.length, unreadCount, data: notifications });
  };

// @desc    Mark notification as read
// @route   PUT /api/notifications/read/:id
// @access  Private
exports.markAsRead = async (req, res) => {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientId: req.user.id },
      { isRead: true },
      { returnDocument: 'after' }
    );

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.status(200).json({ success: true, data: notification });
  };

// @desc    Mark all as read
// @route   PUT /api/notifications/read-all
// @access  Private
exports.markAllAsRead = async (req, res) => {
    await Notification.updateMany(
      { recipientId: req.user.id, isRead: false },
      { isRead: true }
    );

    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  };

// @desc    Get unread active announcements
// @route   GET /api/notifications/announcements/unread
// @access  Private
exports.getUnreadAnnouncements = async (req, res) => {
  try {
    const SystemSettings = require('../models/SystemSettings');
    const User = require('../models/User');

    // Get active announcements
    let settings = await SystemSettings.findOne({ key: 'announcements' });
    let announcements = settings ? settings.value : [];

    // Get user's seen announcements
    const user = await User.findById(req.user.id).select('seenAnnouncements');
    const seenSet = new Set(user.seenAnnouncements || []);

    // Filter out seen ones
    const unread = announcements.filter(a => !seenSet.has(a.id));

    res.status(200).json({ success: true, data: unread });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Dismiss an announcement
// @route   POST /api/notifications/announcements/:id/dismiss
// @access  Private
exports.dismissAnnouncement = async (req, res) => {
  try {
    const User = require('../models/User');
    const { id } = req.params;

    // Add to seen array using $addToSet to prevent duplicates
    await User.findByIdAndUpdate(req.user.id, {
      $addToSet: { seenAnnouncements: id }
    });

    res.status(200).json({ success: true, message: 'Announcement dismissed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
