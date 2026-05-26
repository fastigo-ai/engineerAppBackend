import mongoose from "mongoose";

const engineerScheduleSchema = new mongoose.Schema({
    engineerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Engineer",
        required: true,
        index: true
    },

    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
        default: null
    },

    callId: {
        type: String,
        default: null
    },

    //  IMPORTANT CHANGE
    startTime: {
        type: Date,
        required: true,
        index: true
    },

    endTime: {
        type: Date,
        required: true,
        index: true
    },

    //  IMPROVED STATUS
    status: {
        type: String,
        enum: ["BOOKED", "ONGOING", "COMPLETED", "CANCELLED"],
        default: "BOOKED",
        index: true
    },

    //  TYPE (VERY USEFUL)
    type: {
        type: String,
        enum: ["USER", "VENDOR"],
        required: true
    }

}, {
    timestamps: true
});

//  CRITICAL INDEX (FOR FAST AVAILABILITY CHECK)
engineerScheduleSchema.index({
    engineerId: 1,
    startTime: 1,
    endTime: 1
});

export const EngineerSchedule = mongoose.model(
    "EngineerSchedule",
    engineerScheduleSchema
);