const mongoose = require('mongoose');

const PrintSettingsSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  headerImageURL: {
    type: String, // Cloudinary URL
    default: ''
  },
  footerImageURL: {
    type: String, // Cloudinary URL
    default: ''
  },
  layoutPreferences: {
    marginTop: { type: Number, default: 20, min: 0, max: 1000 },
    marginBottom: { type: Number, default: 20, min: 0, max: 1000 },
    marginLeft: { type: Number, default: 20, min: 0, max: 1000 },
    marginRight: { type: Number, default: 20, min: 0, max: 1000 },
    marginTopWithoutHeader: { type: Number, default: 20, min: 0, max: 1000 },
    marginBottomWithoutFooter: { type: Number, default: 20, min: 0, max: 1000 },
    fontSize: { type: Number, default: 12, min: 1, max: 99 },
    patientInfoFontSize: { type: Number, default: 12, min: 1, max: 99 },
    templateInfoFontSize: { type: Number, default: 12, min: 1, max: 99 },
    signatureFontSize: { type: Number, default: 12, min: 1, max: 99 },
    fontFamily: { type: String, default: 'Helvetica' },
    headerHeight: { type: Number, default: 0, min: 0, max: 1000 },
    footerHeight: { type: Number, default: 0, min: 0, max: 1000 },
    differentHFMargins: { type: Boolean, default: false },
    headerLeftMargin: { type: Number, default: 0, min: 0, max: 1000 },
    headerRightMargin: { type: Number, default: 0, min: 0, max: 1000 },
    footerLeftMargin: { type: Number, default: 0, min: 0, max: 1000 },
    footerRightMargin: { type: Number, default: 0, min: 0, max: 1000 },
    signatureImageWidth: { type: Number, default: 120, min: 10, max: 1000 },
    signatureImageHeight: { type: Number, default: 60, min: 10, max: 1000 },
    spaceHeaderPatient: { type: Number, default: 2, min: 0, max: 200 },
    spacePatientTemplate: { type: Number, default: 2, min: 0, max: 200 },
    spaceTemplateSignature: { type: Number, default: 5, min: 0, max: 200 },
    spaceSignatureFooter: { type: Number, default: 10, min: 0, max: 200 }
  }
}, { timestamps: true });

module.exports = mongoose.model('PrintSettings', PrintSettingsSchema);
