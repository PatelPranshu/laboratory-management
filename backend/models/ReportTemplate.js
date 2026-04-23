const mongoose = require('mongoose');

const SectionSchema = new mongoose.Schema({
  sectionName: {
    type: String,
    required: true
  },
  defaultText: {
    type: String
  },
  parameters: [{
    name: { type: String, required: true },
    units: { type: String },
    // Legacy field — kept for backwards compatibility with existing documents
    isGenderSpecific: { type: Boolean, default: false },
    ruleType: {
      type: String,
      enum: ['MIN_MAX', 'GENDER_SPECIFIC', 'THRESHOLD_COMPARISON'],
      default: 'MIN_MAX'
    },
    normalRange: {
      min: Number,
      max: Number,
      male: { min: Number, max: Number },
      female: { min: Number, max: Number }
    },
    comparisons: [{
      operator: { type: String, enum: ['<', '<=', '>', '>=', '==', 'between'] },
      value: { type: Number },
      valueTo: { type: Number },   // Used only for 'between' operator
      classification: { type: String },
      action: { type: String, enum: ['NORMAL', 'HIGHLIGHT', 'CRITICAL'], default: 'NORMAL' }
    }]
  }]
});

const ReportTemplateSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  templateName: {
    type: String,
    required: true
  },
  sections: [SectionSchema]
}, { timestamps: true });

module.exports = mongoose.model('ReportTemplate', ReportTemplateSchema);
