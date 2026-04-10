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

// Optimized indexes for production-ready regex search
PatientSchema.index({ name: 1 });
PatientSchema.index({ phone: 1 });
PatientSchema.index({ doctorId: 1 }); // Already likely but good to be explicit for compound filters

module.exports = mongoose.model('Patient', PatientSchema);
