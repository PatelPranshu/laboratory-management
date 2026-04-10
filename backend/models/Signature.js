const mongoose = require('mongoose');

const SignatureSchema = new mongoose.Schema({
  doctorName: {
    type: String,
    required: [true, 'Doctor name is required']
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
  doctorId: { 
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

module.exports = mongoose.model('Signature', SignatureSchema);
