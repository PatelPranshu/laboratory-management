const mongoose = require('mongoose');

const SectionSchema = new mongoose.Schema({
  sectionName: {
    type: String,
    default: ''
  },
  defaultText: {
    type: String
  },
  methodology: { type: String },
  sampleType: { type: String },
  kitUsed: { type: String },
  parameters: [{
    name: { type: String, required: true },
    units: { type: String },
    methodology: { type: String },
    sampleType: { type: String },
    kitUsed: { type: String },
    dataType: { 
      type: String, 
      enum: ['NUMERIC', 'TEXT', 'BOOLEAN', 'DATETIME', 'MULTI_SELECT', 'CULTURE_SENSITIVITY', 'CALCULATED', 'DEFAULT_VALUE'],
      default: 'NUMERIC'
    },
    formula: { type: String },
    formulaDependencies: [{ type: String }],
    defaultValue: { type: String },
    options: [{ type: String }],
    suggestions: [{ type: String }],
    isMultiSelect: { type: Boolean, default: true },
    requireMinMax: { type: Boolean, default: false },
    // Legacy field — kept for backwards compatibility with existing documents
    isGenderSpecific: { type: Boolean, default: false },
    ruleType: {
      type: String,
      enum: ['MIN_MAX', 'GENDER_SPECIFIC', 'THRESHOLD_COMPARISON', 'QUALITATIVE'],
      default: 'MIN_MAX'
    },
    referenceRanges: [{
      gender: { type: String, enum: ['MALE', 'FEMALE', 'ANY'], default: 'ANY' },
      ageMin: { type: Number }, // in days
      ageMax: { type: Number }, // in days
      isPregnant: { type: Boolean, default: false },
      min: { type: mongoose.Schema.Types.Mixed },
      max: { type: mongoose.Schema.Types.Mixed },
      textNormal: { type: String }
    }],
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
  department: {
    type: String,
    enum: ['BIOCHEMISTRY', 'MICROBIOLOGY', 'PATHOLOGY', 'HEMATOLOGY', 'IMMUNOLOGY', 'GENERAL'],
    default: 'GENERAL'
  },
  reportType: {
    type: String,
    enum: ['DISCRETE', 'NARRATIVE', 'HYBRID', 'CULTURE'],
    default: 'DISCRETE'
  },
  usageCount: {
    type: Number,
    default: 0
  },
  sections: [SectionSchema]
}, { timestamps: true });

// Performance indexes for production query patterns
ReportTemplateSchema.index({ doctorId: 1, usageCount: -1, templateName: 1 });
ReportTemplateSchema.index({ doctorId: 1, createdAt: -1 });

module.exports = mongoose.model('ReportTemplate', ReportTemplateSchema);
