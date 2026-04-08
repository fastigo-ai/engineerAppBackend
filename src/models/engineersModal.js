import mongoose from 'mongoose';
import { latLngToCell } from "h3-js";

const H3_RESOLUTION = 8;

// Engineer Schema
const EngineerSchema = new mongoose.Schema({
  engineerId: {
    type: String,
    trim: true,
    sparse: true
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
  pincode: {
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
  fcmTokens: [
    {
      token: { type: String, required: true },
      device: { type: String }, // ios, android, web
      lastUsed: { type: Date, default: Date.now }
    }
  ],
  status: {
    type: String,
    enum: ["OFFLINE", "ONLINE", "BUSY"],
    default: "OFFLINE",
    index: true
  },

  lastHeartbeat: {
    type: Date,
    index: true
  },

  lastLocationUpdate: {
    type: Date
  }
}, {
  timestamps: true,
  collection: 'engineers'
});

EngineerSchema.pre("save", function () {
  if (
    this.isModified("location") &&
    this.location &&
    this.location.coordinates &&
    this.location.coordinates.length === 2
  ) {
    const [lng, lat] = this.location.coordinates;

    // ✅ validate coordinates
    if (
      typeof lat === "number" &&
      typeof lng === "number" &&
      lat >= -90 && lat <= 90 &&
      lng >= -180 && lng <= 180
    ) {
      this.h3Index = latLngToCell(lat, lng, H3_RESOLUTION);
      this.lastLocationUpdate = new Date(); // ✅ auto update timestamp
    }
  }
});


EngineerSchema.pre(
  ["findOneAndUpdate", "updateOne", "updateMany"],
  function () {
    let update = this.getUpdate();

    const set = update.$set || {};
    const location = update.location || set.location;

    let newSet = { ...set };

    // ✅ LOCATION LOGIC
    if (
      location &&
      location.coordinates &&
      location.coordinates.length === 2
    ) {
      const [lng, lat] = location.coordinates;

      if (
        typeof lat === "number" &&
        typeof lng === "number" &&
        lat >= -90 && lat <= 90 &&
        lng >= -180 && lng <= 180
      ) {
        newSet.location = location;
        newSet.h3Index = latLngToCell(lat, lng, H3_RESOLUTION);
        newSet.lastLocationUpdate = new Date();

        delete update.location; // prevent conflict
      }
    }

    // ✅ HEARTBEAT LOGIC
    if (newSet.status === "ONLINE") {
      newSet.lastHeartbeat = new Date();
    }

    // ✅ SINGLE FINAL UPDATE (IMPORTANT)
    this.setUpdate({
      ...update,
      $set: newSet
    });
  }
);


// Index for geospatial queries
EngineerSchema.index({ location: '2dsphere' });
EngineerSchema.index({ 'fcmTokens.token': 1 });
EngineerSchema.index({
  h3Index: 1,
  status: 1,
  lastHeartbeat: 1,
  engineerId: 1
});

export const Engineer = mongoose.model('Engineer', EngineerSchema);