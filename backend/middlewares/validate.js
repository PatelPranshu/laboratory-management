const mongoose = require('mongoose');

/**
 * Middleware: Validate that :id param is a valid MongoDB ObjectId.
 * Prevents CastError crashes from invalid ID formats.
 */
const validateObjectId = (req, res, next) => {
  if (req.params.id && !mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid ID format'
    });
  }
  next();
};

/**
 * Utility: Pick only allowed fields from an object.
 * Prevents mass-assignment attacks where attackers inject fields like doctorId.
 */
const pickFields = (source, allowedFields) => {
  const result = {};
  for (const field of allowedFields) {
    if (source[field] !== undefined) {
      result[field] = source[field];
    }
  }
  return result;
};

/**
 * Validate email format
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate password strength:
 * - Minimum 8 characters
 * - At least 1 uppercase letter
 * - At least 1 number
 */
const isStrongPassword = (password) => {
  if (!password || password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
};

module.exports = {
  validateObjectId,
  pickFields,
  isValidEmail,
  isStrongPassword
};
