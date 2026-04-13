const mongoose = require('mongoose');

const SignatureSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Name is required']
  },
  signatureUrl: {
    type: String,
    required: [true, 'Signature image URL is required']
  },
  parentAdminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

module.exports = mongoose.model('Signature', SignatureSchema);
