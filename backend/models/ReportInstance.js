const mongoose = require('mongoose');

const ReportSectionSchema = new mongoose.Schema({
  sectionName: {
    type: String,
    default: ''
  },
  templateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ReportTemplate'
  },
  text: {
    type: String
  },
  methodology: { type: String },
  sampleType: { type: String },
  kitUsed: { type: String },
  parameters: [{
    name: { type: String, required: true },
    dataType: { 
      type: String, 
      enum: ['NUMERIC', 'TEXT', 'BOOLEAN', 'DATETIME', 'ATTACHMENT', 'MULTI_SELECT', 'CULTURE_SENSITIVITY', 'CALCULATED', 'DEFAULT_VALUE'],
      default: 'NUMERIC'
    },
    formula: { type: String },
    formulaDependencies: [{ type: String }],
    result: { type: String },
    valueNumeric: { type: Number },
    valueText: { type: String },
    valueBoolean: { type: Boolean },
    attachments: [{ type: String }],
    cultureResults: [{
      organism: { type: String },
      colonyCount: { type: String },
      sensitivities: [{
        antibiotic: { type: String },
        interpretation: { type: String }
      }]
    }],
    units: { type: String },
    methodology: { type: String },
    sampleType: { type: String },
    kitUsed: { type: String },
    // Legacy field — kept for backwards compatibility with existing documents
    isGenderSpecific: { type: Boolean, default: false },
    ruleType: {
      type: String,
      enum: ['MIN_MAX', 'GENDER_SPECIFIC', 'THRESHOLD_COMPARISON', 'QUALITATIVE'],
      default: 'MIN_MAX'
    },
    normalRange: {
      min: mongoose.Schema.Types.Mixed,
      max: mongoose.Schema.Types.Mixed,
      male: { min: mongoose.Schema.Types.Mixed, max: mongoose.Schema.Types.Mixed },
      female: { min: mongoose.Schema.Types.Mixed, max: mongoose.Schema.Types.Mixed },
      textNormal: { type: String }
    },
    comparisons: [{
      operator: { type: String, enum: ['<', '<=', '>', '>=', '==', 'between', 'equals', 'contains'] },
      value: { type: mongoose.Schema.Types.Mixed },
      valueTo: { type: mongoose.Schema.Types.Mixed },
      classification: { type: String },
      action: { type: String, enum: ['NORMAL', 'HIGHLIGHT', 'CRITICAL'], default: 'NORMAL' }
    }]
  }]
});

const AuditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ['Created', 'Modified', 'Sent', 'Downloaded PDF', 'Shared']
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  date: {
    type: Date,
    default: Date.now
  }
});

const ReportInstanceSchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: true
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  creatorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  verifierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  date: {
    type: Date,
    default: Date.now
  },
  referredBy: {
    type: String,
    trim: true,
    default: 'Self'
  },
  performedBy: {
    type: String,
    trim: true
  },
  performedByLabTechId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Signature'
  },
  templateIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ReportTemplate'
  }],
  sections: [ReportSectionSchema],
  status: {
    type: String,
    enum: ['draft', 'saved', 'sent', 'DRAFT', 'PENDING_REVIEW', 'FINAL', 'AMENDED'],
    default: 'draft'
  },
  authorizedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  amendmentHistory: [{
    date: { type: Date, default: Date.now },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String },
    previousStatus: { type: String },
    previousState: { type: mongoose.Schema.Types.Mixed }
  }],
  auditLogs: [AuditLogSchema]
}, { timestamps: true });

// Index for test parameter search might require specialized index if values is an object, 
// but for text search we could index common text fields
ReportInstanceSchema.index({ 'sections.text': 'text', 'sections.values': 'text' });
// Index for optimal querying and filtering by doctor and creation date
ReportInstanceSchema.index({ doctorId: 1, createdAt: -1 });

module.exports = mongoose.model('ReportInstance', ReportInstanceSchema);
