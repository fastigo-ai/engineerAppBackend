import mongoose from "mongoose";

const SystemSettingsSchema = new mongoose.Schema(
{
  platformCommissionRate: {
    type: Number,
    default: 0.25,
    min: 0,
    max: 1
  },
  minimumWithdrawalAmount: {
    type: Number,
    default: 500
  },
  maximumWithdrawalAmount: {
    type: Number,
    default: 50000
  },
  currency: {
    type: String,
    default: "INR"
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin"
  }
},
{
 timestamps: true
});

export const SystemSettings = mongoose.model("SystemSettings", SystemSettingsSchema);
