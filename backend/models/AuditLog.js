const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: [
      'LAB_SUSPENDED',
      'LAB_ACTIVATED',
      'LAB_RESTORED',
      'LAB_HOLD_TOGGLED',
      'LAB_PERMANENTLY_DELETED',
      'STAFF_ROLE_CHANGED',
      'STAFF_REMOVED',
      'STAFF_HARD_DELETED',
      'PASSWORD_RESET_FORCED',
      'ANNOUNCEMENT_CREATED',
      'ANNOUNCEMENT_DELETED',
      'DELETION_REASONS_UPDATED',
      'DATA_EXPORTED',
      'LOGOUT_FORCED',
      'LOGIN_SUCCESS',
      'LOGIN_FAILED',
      'LOGOUT',
      'PASSWORD_CHANGED',
      'PASSWORD_RESET',
      'PATIENT_CREATED',
      'PATIENT_UPDATED',
      'PATIENT_DELETED',
      'REPORT_CREATED',
      'REPORT_UPDATED',
      'REPORT_SENT',
      'REPORT_DOWNLOADED',
      'REPORT_DELETED'
    ],
    index: true
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  targetType: {
    type: String,
    enum: ['Lab', 'Staff', 'System', 'Auth', 'Patient', 'Report'],
    default: 'Lab'
  },
  details: {
    type: String,
    required: true,
    maxlength: [500, 'Details cannot exceed 500 characters']
  },
  ipAddress: {
    type: String,
    default: 'unknown'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed
  }
}, { timestamps: true });

// Indexes for efficient querying
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ targetId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
