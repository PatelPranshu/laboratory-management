const User = require('../models/User');
const socketService = require('../services/socketService');

/**
 * Updates lab statistics in the User document.
 * Uses $inc for atomic counter updates, then clamps to zero floor
 * to prevent negative drift from race conditions or bugs.
 * @param {string} adminId - The ID of the lab admin/owner
 * @param {object} increments - Object containing fields to increment/decrement (e.g. { 'stats.totalPatients': 1 })
 * @param {object} session - Optional Mongoose session for transactions
 */
const updateLabStats = async (adminId, increments, session = null) => {
  if (!adminId) return;

  // Atomic increment
  await User.findByIdAndUpdate(adminId, { $inc: increments }, { session });

  // Floor-zero guard: clamp any stat that went negative back to 0
  // Only run if any decrement was applied (performance optimization)
  const hasDecrement = Object.values(increments).some(v => v < 0);
  if (hasDecrement) {
    await User.findByIdAndUpdate(adminId, {
      $max: {
        'stats.totalPatients': 0,
        'stats.totalReports': 0,
        'stats.pendingReports': 0,
        'stats.sentReports': 0
      }
    }, { session });
  }

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
