const mongoose = require('mongoose');

const ReportSectionSchema = new mongoose.Schema({
  sectionName: {
    type: String,
    required: true
  },
  text: {
    type: String
  },
  parameters: [{
    name: { type: String, required: true },
    result: { type: String },
    units: { type: String },
    isGenderSpecific: { type: Boolean, default: false },
    normalRange: {
      min: Number,
      max: Number,
      male: { min: Number, max: Number },
      female: { min: Number, max: Number }
    }
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
  date: {
    type: Date,
    default: Date.now
  },
  referredBy: {
    type: String,
    required: [true, 'Referring doctor/clinic is required']
  },
  templateIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Template'
  }],
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
