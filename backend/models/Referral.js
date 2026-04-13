const mongoose = require('mongoose');

const ReferralSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Referral name is required'],
    trim: true
  },
  parentAdminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Referral', ReferralSchema);
