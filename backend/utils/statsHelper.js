const User = require('../models/User');
const socketService = require('../services/socketService');

/**
 * Updates lab statistics in the User document.
 * @param {string} adminId - The ID of the lab admin/owner
 * @param {object} increments - Object containing fields to increment/decrement (e.g. { 'stats.totalPatients': 1 })
 * @param {object} session - Optional Mongoose session for transactions
 */
const updateLabStats = async (adminId, increments, session = null) => {
  if (!adminId) return;
  await User.findByIdAndUpdate(adminId, { $inc: increments }, { session });

  try {
    const io = socketService.getIO();
    const recipients = await User.find({
      $or: [
        { _id: adminId }, 
        { parentAdminId: adminId }
      ],
      accountStatus: 'Active'
    }).select('_id').lean();

    recipients.forEach(user => {
      io.to(`user_${user._id}`).emit('stats_updated');
    });
  } catch (error) {
    // Ignore socket error if not initialized
  }
};

module.exports = { updateLabStats };
