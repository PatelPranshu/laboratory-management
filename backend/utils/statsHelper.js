const User = require('../models/User');

/**
 * Updates lab statistics in the User document.
 * @param {string} adminId - The ID of the lab admin/owner
 * @param {object} increments - Object containing fields to increment/decrement (e.g. { 'stats.totalPatients': 1 })
 */
const updateLabStats = async (adminId, increments) => {
  try {
    if (!adminId) return;
    await User.findByIdAndUpdate(adminId, { $inc: increments });
  } catch (err) {
    console.error('Failed to update lab stats:', err.message);
  }
};

module.exports = { updateLabStats };
