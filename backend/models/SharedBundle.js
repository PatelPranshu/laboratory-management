const mongoose = require('mongoose');

const SharedBundleSchema = new mongoose.Schema({
  shareCode: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  templateIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ReportTemplate'
  }],
  importedBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    labName: String,
    importedAt: {
      type: Date,
      default: Date.now
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400 // Automatically delete document after 24 hours (86400 seconds)
  }
});

module.exports = mongoose.model('SharedBundle', SharedBundleSchema);
