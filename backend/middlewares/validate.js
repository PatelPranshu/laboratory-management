const mongoose = require('mongoose');
const { z } = require('zod');

/**
 * Middleware: Validate that :id param is a valid MongoDB ObjectId.
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
 * Legacy utility: Pick only allowed fields from an object.
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
 * Zod validation middleware
 */
const validateSchema = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Pass ZodError to the global errorHandler
      error.statusCode = 400;
      return next(error);
    }
    next(error);
  }
};

/**
 * Zod custom validators for common fields
 */
const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: 'Invalid ObjectId'
});

const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password cannot exceed 72 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]+/, 'Password must contain at least one special character');

const complianceFlagSchema = z.union([z.boolean(), z.string(), z.number()])
  .refine(val => [true, 'true', 'on', '1', 1].includes(val), {
    message: 'You must accept the Terms & Conditions and Privacy Policy'
  });

module.exports = {
  validateObjectId,
  pickFields,
  validateSchema,
  objectIdSchema,
  passwordSchema,
  complianceFlagSchema
};
