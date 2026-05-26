import mongoose from 'mongoose';

const adminSubscriptionSchema = new mongoose.Schema({
  endpoint: {
    type: String,
    required: true,
    unique: true
  },
  keys: {
    p256dh: {
      type: String,
      required: true
    },
    auth: {
      type: String,
      required: true
    }
  },
  adminName: {
    type: String,
    default: 'Admin'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const AdminSubscription = mongoose.model('AdminSubscription', adminSubscriptionSchema);

export default AdminSubscription;
