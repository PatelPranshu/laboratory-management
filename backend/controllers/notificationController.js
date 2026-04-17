const Notification = require('../models/Notification');

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
exports.getNotifications = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    
    const notifications = await Notification.find({ recipientId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(limit);
      
    const unreadCount = await Notification.countDocuments({ recipientId: req.user.id, isRead: false });

    res.status(200).json({ success: true, count: notifications.length, unreadCount, data: notifications });
  } catch (error) {
    console.error('getNotifications error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to retrieving notifications' });
  }
};

// @desc    Mark notification as read
// @route   PUT /api/notifications/read/:id
// @access  Private
exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientId: req.user.id },
      { isRead: true },
      { returnDocument: 'after' }
    );

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    console.error('markAsRead error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to mark notification as read' });
  }
};

// @desc    Mark all as read
// @route   PUT /api/notifications/read-all
// @access  Private
exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipientId: req.user.id, isRead: false },
      { isRead: true }
    );

    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('markAllAsRead error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to mark all notifications as read' });
  }
};
