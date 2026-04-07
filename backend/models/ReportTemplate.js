const mongoose = require('mongoose');

const SectionSchema = new mongoose.Schema({
  sectionName: {
    type: String,
    required: true
  },
  defaultText: {
    type: String
  },
  defaultValues: {
    type: mongoose.Schema.Types.Mixed // For dynamic params e.g. { Hemoglobin: "14 g/dL" }
  }
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
