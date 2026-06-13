const Notification = require('../models/Notification');
const User = require('../models/User');
const socketService = require('../services/socketService');
const logger = require('./logger');

/**
 * Sends a notification to all relevant staff members in a laboratory group.
 * @param {string} senderId - ID of the user performing the action.
 * @param {string} adminId - ID of the Lab Admin (Doctor/Owner).
 * @param {Object} options - Notification details.
 * @param {string} options.type - 'NEW_PATIENT' or 'NEW_REPORT'.
 * @param {string} options.title - Short title.
 * @param {string} options.message - Descriptive body.
 * @param {string} options.referenceId - ID of the related object (Patient/Report).
 * @param {object} session - Optional mongoose session.
 */
const sendNotification = async (senderId, adminId, { type, title, message, referenceId }, session = null) => {
  try {
    const io = socketService.getIO();

    // Find all staff under this admin's lab, including the admin themselves
    // EXCLUDE the sender to avoid self-notifications
    const recipients = await User.find({
      $or: [
        { _id: adminId }, 
        { parentAdminId: adminId }
      ],
      _id: { $ne: senderId },
      accountStatus: 'Active'
    }).select('_id');

    if (recipients.length === 0) return;

    const notificationData = recipients.map(recipient => ({
      recipientId: recipient._id,
      senderId,
      type,
      title,
      message,
      referenceId
    }));

    // Insert into DB for persistence
    const insertedNotifications = await Notification.insertMany(notificationData, { session });

    // Broadcast to active socket rooms
    insertedNotifications.forEach(noti => {
      io.to(`user_${noti.recipientId}`).emit('new_notification', noti);
    });

  } catch (error) {
    logger.error('Notification Service Error:', error);
  }
};

module.exports = { sendNotification };
