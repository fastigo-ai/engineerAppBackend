import mongoose from 'mongoose';
import { latLngToCell } from "h3-js";

const H3_RESOLUTION = 8;

// Engineer Schema
const EngineerSchema = new mongoose.Schema({
  engineerId: {
    type: String,
    trim: true,
    sparse: true // Allows multiple null values for backwards compatibility
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    sparse: true // Allows multiple null values
  },
  mobile: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  skills: {
    type: [String],
    default: []
  },
  pincode : {
    type: String,
    trim: true
  },
  categories: {
    type: [String],
    default: []
  },
  address: {
    type: String,
    trim: true
  },
  currentLocation: {
    type: String,
    trim: true // Location as string (e.g., "Bangalore, Karnataka")
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  isSuspended: {
    type: Boolean,
    default: false
  },
  assignedOrders: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  }],
  location: {
    type: mongoose.Schema.Types.Mixed,
    default: undefined
  },
  // Additional metadata
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalJobs: {
    type: Number,
    default: 0
  },
  completedJobs: {
    type: Number,
    default: 0
  },
  h3Index: {
  type: String,
  index: true 
},
}, {
  timestamps: true,
  collection: 'engineers'
});

EngineerSchema.pre("save", function () {
  if (
    this.isModified("location") &&
    this.location?.coordinates?.length === 2
  ) {
    const [lng, lat] = this.location.coordinates;

    this.h3Index = latLngToCell(lat, lng, H3_RESOLUTION);
  }

  
});

EngineerSchema.pre(
  ["findOneAndUpdate", "updateOne", "updateMany"],
  function () {
    const update = this.getUpdate();

    const location =
      update?.location ||
      update?.$set?.location;

    if (
      location?.coordinates &&
      location.coordinates.length === 2
    ) {
      const [lng, lat] = location.coordinates;

      this.setUpdate({
        ...update,
        $set: {
          ...update.$set,
          h3Index: latLngToCell(lat, lng, H3_RESOLUTION),
        },
      });
    }

    
  }
);


// Index for geospatial queries
EngineerSchema.index({ location: '2dsphere' });
EngineerSchema.index({ engineerId: 1 });

export const Engineer = mongoose.model('Engineer', EngineerSchema);