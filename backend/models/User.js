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
      values: ['Admin', 'Doctor', 'LabTech'],
      message: '{VALUE} is not a valid role'
    },
    default: 'Doctor'
  },
  labName: {
    type: String,
    required: [true, 'Lab name is required'],
    trim: true,
    maxlength: [100, 'Lab name cannot exceed 100 characters']
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
  }
}, { timestamps: true });

// Encrypt password using bcrypt
UserSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
UserSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
