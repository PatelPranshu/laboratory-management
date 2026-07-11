const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email']
  },
  name: {
    type: String,
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  role: {
    type: String,
    enum: {
      values: ['SuperAdmin', 'Admin', 'Doctor', 'LabTech'],
      message: '{VALUE} is not a valid role'
    },
    default: 'Doctor'
  },
  labName: {
    type: String,
    trim: true,
    maxlength: [100, 'Lab name cannot exceed 100 characters'],
    required: function() {
      return this.role !== 'SuperAdmin';
    }
  },
  signature: {
    type: String // URL to signature image
  },
  subscriptionStatus: {
    type: String,
    enum: ['active', 'inactive', 'trial'],
    default: 'trial'
  },
  parentAdminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  accountStatus: {
    type: String,
    enum: ['Pending', 'Active', 'Suspended'],
    default: 'Pending'
  },
  mustChangePassword: {
    type: Boolean,
    default: false
  },
  signatureUrl: {
    type: String
  },
  doctorName: {
    type: String
  },
  // Performance Optimization: Counter Caching for Dashboard
  stats: {
    totalPatients: { type: Number, default: 0 },
    totalReports: { type: Number, default: 0 },
    pendingReports: { type: Number, default: 0 },
    sentReports: { type: Number, default: 0 },
    weeklyReports: { type: Array, default: [] }
  },
  passwordChangedAt: {
    type: Date
  },
  // Soft delete fields
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },
  holdDeletion: {
    type: Boolean,
    default: false
  },
  deletionReason: {
    type: String,
    default: null
  },
  seenAnnouncements: {
    type: [String],
    default: []
  }
}, { timestamps: true });

// Encrypt password using bcrypt
UserSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  // Set passwordChangedAt, subtract 1000ms to ensure the token created right after isn't accidentally invalidated
  if (!this.isNew) {
    this.passwordChangedAt = Date.now() - 1000;
  }
});

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Performance indexes for production query patterns
UserSchema.index({ parentAdminId: 1, createdAt: -1 });
UserSchema.index({ role: 1, isDeleted: 1, accountStatus: 1 });

module.exports = mongoose.model('User', UserSchema);
