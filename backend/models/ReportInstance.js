const mongoose = require('mongoose');

const ReportSectionSchema = new mongoose.Schema({
  sectionName: {
    type: String,
    required: true
  },
  text: {
    type: String
  },
  values: {
    type: mongoose.Schema.Types.Mixed // Filled out values { Hemoglobin: "12 g/dL" }
  }
});

const AuditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    enum: ['Created', 'Modified', 'Sent']
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
  date: {
    type: Date,
    default: Date.now
  },
  sections: [ReportSectionSchema],
  status: {
    type: String,
    enum: ['draft', 'saved', 'sent'],
    default: 'draft'
  },
  auditLogs: [AuditLogSchema]
}, { timestamps: true });

// Index for test parameter search might require specialized index if values is an object, 
// but for text search we could index common text fields
ReportInstanceSchema.index({ 'sections.text': 'text', 'sections.values': 'text' });

module.exports = mongoose.model('ReportInstance', ReportInstanceSchema);
