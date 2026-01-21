import mongoose from "mongoose";

const VendorOrderSchema = new mongoose.Schema(
  {
    /* -------- Vendor / Project Info -------- */
    vendor_id: { type: String, required: true, index: true },
    project_id: { type: String, required: true },
    call_id: { type: String, required: true },

    state_name: { type: String, required: true },
    branch_name: { type: String, required: true },
    branch_category: String,
    branch_code: { type: String, index: true },

    /* -------- Address Info -------- */
    complete_address: { type: String, required: true },
    pincode: { type: String, index: true },

    /* -------- Contact -------- */
    contact_name: String,
    contact_phone: String,

    /* -------- Order Meta -------- */
    assets_count: { type: Number, default: 1 },
    support_type: {
      type: String,
      enum: ["pm_activity", "breakfix", "on_call"],
      required: true,
    },
    asset_type: {
      type: String,
      enum: ["Laptop", "Printer", "Network", "ATM"],
      required: true,
    },

    /* -------- Geo Location -------- */
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true },
    },

    /* -------- Assignment -------- */
    status: {
      type: String,
      enum: ["PENDING", "MATCHING", "ACCEPTED", "EXPIRED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },
    assigned_engineer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Engineer",
      default: null,
    },
    notified_engineers: [String],
    rejected_engineers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Engineer",
      },
    ],
    locked_at: Date,
    match_attempts: { type: Number, default: 0 },
    failure_reason: String,

    /* -------- Support -------- */
    l1_support_name: String,
    l1_support_number: String,

    /* -------- Expiry -------- */
    expires_at: {
      type: Date,
      index: { expireAfterSeconds: 0 },
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  },
);

/* -------- Indexes -------- */
VendorOrderSchema.index({ location: "2dsphere" });
VendorOrderSchema.index({ status: 1, created_at: -1 });
VendorOrderSchema.index({ vendor_id: 1, call_id: 1 }, { unique: true });

export default mongoose.model("VendorOrder", VendorOrderSchema);
