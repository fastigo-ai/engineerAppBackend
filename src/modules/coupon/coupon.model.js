import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    index: true
  },
  description: {
    type: String,
    trim: true,
    default: null
  },
  type: {
    type: String,
    enum: ['FLAT', 'PERCENTAGE'],
    required: true
  },
  value: {
    type: Number, // in paise if FLAT, otherwise percentage
    required: true,
    min: 0
  },
  maxDiscount: {
    type: Number, // in paise
    default: null
  },
  minOrderAmount: {
    type: Number, // in paise
    default: 0
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  usageLimit: {
    type: Number,
    required: true,
    default: 1
  },
  perUserLimit: {
    type: Number,
    required: true,
    default: 1,
    min: 1
  },
  usedCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  applicablePlans: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ServicePlan'
  }],
  applicableCategories: [{
    type: String // or Category ID if you have a Category model
  }],
  targeting: {
    userSegments: [{
      type: String,
      enum: ['NEW', 'ACTIVE', 'INACTIVE', 'VIP'],
      index: true
    }],
    cities: [{
      type: String,
      trim: true,
      index: true
    }],
    applicableCategories: [{
      type: String,
      trim: true
    }],
    firstTimeUserOnly: {
      type: Boolean,
      default: false
    },
    specificUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true
    }]
  },
  isHidden: {
    type: Boolean,
    default: false,
    index: true
  },
  createdBy: {
    type: String,
    enum: ['ADMIN', 'VENDOR'],
    default: 'ADMIN'
  },
  stats: {
    totalApplied: { type: Number, default: 0 },   // Incremented on Reservation
    totalRedeemed: { type: Number, default: 0 },  // Incremented on Commit (USED)
    totalFailed: { type: Number, default: 0 }     // Incremented on Rollback/Expiry
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for conversion rate calculation
couponSchema.virtual('conversionRate').get(function() {
  if (!this.stats || !this.stats.totalApplied) return 0;
  return parseFloat(((this.stats.totalRedeemed / this.stats.totalApplied) * 100).toFixed(2));
});

// Compound indexes for optimization
couponSchema.index({ isActive: 1, startDate: 1, endDate: 1 });

const Coupon = mongoose.model('Coupon', couponSchema);
export default Coupon;
