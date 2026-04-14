import mongoose from 'mongoose';

const deviceTokenSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'userModel'
  },
  userModel: {
    type: String,
    required: true,
    enum: ['User', 'Engineer']
  },
  fcmToken: {
    type: String,
    required: true,
    index: true
  },
  platform: {
    type: String,
    enum: ['android', 'ios', 'web'],
    required: true
  },
  deviceId: {
    type: String,
    required: true
  },
  appVersion: {
    type: String
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  lastSeenAt: {
    type: Date,
    default: Date.now
  },
  invalidatedAt: {
    type: Date,
    default: null
  }
}, { timestamps: true });

// Compound indexes
deviceTokenSchema.index({ userId: 1, userModel: 1, isActive: 1 });
deviceTokenSchema.index({ fcmToken: 1 }, { unique: true });
deviceTokenSchema.index({ deviceId: 1, userId: 1, userModel: 1 }, { unique: true });

const DeviceToken = mongoose.model('DeviceToken', deviceTokenSchema);

export default DeviceToken;
