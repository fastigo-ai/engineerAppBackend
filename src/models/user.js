import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  engineerId: { type: String, unique: true },
  mobile: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  password: { type: String, required: true },

  userType: {
    type: String,
    required: true,
    enum: ['b2c', 'b2b'],
    default: 'b2c',
  },
  role: {
    type: String,
    required: true,
    enum: [
      'customer',
      'company_admin',
      'company_user',
      'engineer',
      'super_admin',
    ],
    default: 'customer',
  },

  company: {
    name: { type: String },
    taxId: { type: String },
  },

  // General Info
  address: { type: String, required: false },

  // Phone verification status (OTP handled by Twilio Verify)
  isPhoneVerified: { type: Boolean, default: false },

  // Engineer verification status (for admin approval)
  isVerified: { type: Boolean, default: false },

  status: {
    type: String,
    required: true,
    enum: ['active', 'pending_verification', 'suspended'],
    default: 'pending_verification',
  },

  // Location for Engineers
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: [0, 0] // [longitude, latitude]
    }
  }
}, {
  timestamps: true,
});

// Index for geospatial queries
userSchema.index({ location: '2dsphere' });

const User = mongoose.model('User', userSchema);

export default User;
