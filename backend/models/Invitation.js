const mongoose = require('mongoose');

const InvitationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
  },
  role: {
    type: String,
    enum: ['Doctor', 'LabTech'],
    required: true
  },
  token: {
    type: String,
    required: true
  },
  parentAdminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: '24h' // Automatically delete after 24 hours
  }
});

module.exports = mongoose.model('Invitation', InvitationSchema);
