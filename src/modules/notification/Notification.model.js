import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
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
  type: {
    type: String,
    enum: ['ORDER_UPDATE', 'PAYMENT', 'COUPON', 'PROMO', 'SYSTEM', 'MATCHING'],
    required: true,
  },
  title: { type: String, required: true },
  body: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Queue mechanics
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'SENT', 'FAILED'],
    default: 'PENDING',
    index: true,
  },
  nextRunAt: { type: Date, default: Date.now, index: true },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },

  // Distributed lock
  lockedAt: { type: Date, default: null },
  lockedUntil: { type: Date, default: null },

  // Result tracking
  fcmMessageId: { type: String, default: null },
  failureReason: { type: String, default: null },
  sentAt: { type: Date, default: null },
  openedAt: { type: Date, default: null },
  is_deleted: { type: Boolean, default: false, index: true },
}, { timestamps: true });

// Optimized index for worker polling
notificationSchema.index({ status: 1, nextRunAt: 1, lockedUntil: 1 });
// Inbox index
notificationSchema.index({ userId: 1, userModel: 1, createdAt: -1 });
// TTL for auto-cleanup (30 days)
notificationSchema.index({ sentAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
