import mongoose from "mongoose";

const ServiceItemSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    quantity: {
      type: Number,
      default: 1,
    },
    image: {
      type: String,
      default: null,
    },
  },
  { _id: false },
);

const BookingDetailsSchema = new mongoose.Schema(
  {
    date: {
      type: String,
      trim: true,
    },
    time: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    services: [ServiceItemSchema],
  },
  { _id: false },
);

const OrderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    servicePlan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServicePlan",
      required: false, // Made optional for backward compatibility
    },
    servicePlans: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ServicePlan",
      },
    ],
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
      uppercase: true,
    },
    status: {
      type: String,
      enum: [
        "created",
        "pending",
        "paid",
        "failed",
        "refunded",
        "completed",
        "cancelled",
      ],
      default: "created",
      index: true,
    },
    razorpayOrderId: {
      type: String,
      trim: true,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      trim: true,
    },
    orderStatus: {
      type: String,
      trim: true,
      enum: ["Upcoming", "Completed", "Cancelled", "Accepted", "Rejected"],
      default: "Upcoming",
    },
    assignedEngineer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Engineer", // Changed to User since engineerId is from User model
      default: null,
    },
    acceptedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Engineer",
      default: null,
    },
    rejectedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Engineer",
      },
    ],
    razorpaySignature: {
      type: String,
      trim: true,
    },
    customerDetails: {
      name: {
        type: String,
        trim: true,
      },
      email: {
        type: String,
        trim: true,
        lowercase: true,
      },
      phone: {
        type: String,
        trim: true,
      },
    },
    bookingDetails: BookingDetailsSchema,
    location: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },
    notes: {
      type: Map,
      of: String,
    },
    work_status: {
      type: String,
      trim: true,
      enum: [
        "Upcoming",
        "Completed",
        "In Progress",
        "Cancelled",
        "Accepted",
        "Rejected",
      ],
      default: "Upcoming",
    },
    receipt: {
      type: String,
      trim: true,
    },
    failureReason: {
      type: String,
      trim: true,
    },
    refundDetails: {
      refundId: String,
      amount: Number,
      status: String,
      refundedAt: Date,
    },
  },
  {
    timestamps: true,
    collection: "orders",
  },
);

// Index for faster queries
OrderSchema.index({ userId: 1, status: 1 });
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ location: "2dsphere" });

export const Order = mongoose.model("Order", OrderSchema);
