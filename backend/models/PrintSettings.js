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
    marginTop: { type: Number, default: 20 },
    marginBottom: { type: Number, default: 20 },
    marginLeft: { type: Number, default: 20 },
    marginRight: { type: Number, default: 20 },
    fontSize: { type: Number, default: 12 },
    fontFamily: { type: String, default: 'Helvetica' },
    headerHeight: { type: Number, default: 0 },
    footerHeight: { type: Number, default: 0 }
  }
}, { timestamps: true });

module.exports = mongoose.model('PrintSettings', PrintSettingsSchema);
