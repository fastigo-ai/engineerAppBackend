import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  engineerId: { type: String, unique: true },
  mobile: { type: String, required: true, unique: true },
  email: { type: String, required: true, index: true },
  password: { type: String, required: true },
  profileImage: { type: String, default: null },


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
      'admin',
    ],
    default: 'customer',
  },

  company: {
    name: { type: String },
    taxId: { type: String },
  },

  // General Info
  address: { type: String, required: false },
  city: { type: String, trim: true, index: true },

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
  },
  refreshToken: {
    type: String,
    default: null
  },
  tokenVersion: {
    type: Number,
    default: 0
  },

  fcmTokens: [
    {
      token: { type: String, required: true },
      device: { type: String }, // ios, android, web
      lastUsed: { type: Date, default: Date.now }
    }
  ],
}, {
  timestamps: true,
});

// Index for geospatial queries
userSchema.index({ location: '2dsphere' });

// Index for FCM tokens
userSchema.index({ 'fcmTokens.token': 1 });

const User = mongoose.model('User', userSchema);

export default User;
