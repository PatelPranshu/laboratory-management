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
    isGenderSpecific: { type: Boolean, default: false },
    normalRange: {
      min: Number,
      max: Number,
      male: { min: Number, max: Number },
      female: { min: Number, max: Number }
    }
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
