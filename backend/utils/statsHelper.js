const User = require('../models/User');

/**
 * Updates lab statistics in the User document.
 * @param {string} adminId - The ID of the lab admin/owner
 * @param {object} increments - Object containing fields to increment/decrement (e.g. { 'stats.totalPatients': 1 })
 * @param {object} session - Optional Mongoose session for transactions
 */
const updateLabStats = async (adminId, increments, session = null) => {
  if (!adminId) return;
  await User.findByIdAndUpdate(adminId, { $inc: increments }, { session });
};

module.exports = { updateLabStats };
