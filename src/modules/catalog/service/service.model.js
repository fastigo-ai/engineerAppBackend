import mongoose from 'mongoose';

const ServicePlanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  subtitle: {
    type: String,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  image: {
    type: String,
    trim: true
  },
  features: [{
    type: String,
    required: true,
    trim: true
  }],
  planType: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ServicePlanType',
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true,
  },
  duration: {
    type: Number,
    required: true,
    min: 0,
    default: 45 // Default to 45 mins if not specified
  },
}, {
  timestamps: true,
  collection: 'servicePlan'
});

export const ServicePlan = mongoose.model('ServicePlan', ServicePlanSchema);
