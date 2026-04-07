const mongoose = require('mongoose');

const PatientSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  email: {
    type: String
  },
  age: {
    type: Number,
    required: true
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    required: true
  },
  address: {
    type: String
  }
}, { timestamps: true });

// Create text index for search
PatientSchema.index({ name: 'text', phone: 'text' });

module.exports = mongoose.model('Patient', PatientSchema);
