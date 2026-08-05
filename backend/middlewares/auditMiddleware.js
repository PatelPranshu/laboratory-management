const AuditLog = require('../models/AuditLog');

/**
 * Extracts client IP address from express request, handling reverse proxies.
 */
const getClientIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown';
};

/**
 * Creates an audit log entry asynchronously. Non-blocking (fire-and-forget).
 */
const logAudit = async (action, performedBy, targetId, targetType, details, ipAddress, metadata = null) => {
  try {
    await AuditLog.create({
      action,
      performedBy,
      targetId,
      targetType,
      details: String(details).slice(0, 500),
      ipAddress: ipAddress || 'unknown',
      metadata
    });
  } catch (err) {
    console.error('[AuditLog] Failed to write audit log:', err.message);
  }
};

module.exports = {
  getClientIp,
  logAudit
};
