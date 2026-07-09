const mongoose = require('mongoose');

const PatientSchema = new mongoose.Schema({
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  name: {
    type: String,
    required: true
  },
  phone: {
    type: String
  },
  email: {
    type: String
  },
  age: {
    type: Number,
    required: true
  },
  ageUnit: {
    type: String,
    enum: ['Years', 'Months', 'Days'],
    default: 'Years'
  },
  gender: {
    type: String,
    enum: ['Male', 'Female', 'Other'],
    required: true
  },
  weight: {
    type: Number
  },
  height: {
    type: Number
  },
  address: {
    type: String
  }
}, { timestamps: true });

// Optimized indexes for production-ready regex search
PatientSchema.index({ name: 'text' });
PatientSchema.index({ phone: 1 });
PatientSchema.index({ doctorId: 1, createdAt: -1 });

module.exports = mongoose.model('Patient', PatientSchema);
