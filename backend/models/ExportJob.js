const mongoose = require('mongoose');

const exportJobSchema = new mongoose.Schema({
  labId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'],
    default: 'PENDING',
    index: true
  },
  filePaths: [{
    type: String
  }],
  errorReason: {
    type: String
  },
  expiresAt: {
    type: Date,
    index: { expires: '48h' } // Automatically delete MongoDB document after 48 hours
  }
}, { timestamps: true });

module.exports = mongoose.model('ExportJob', exportJobSchema);
