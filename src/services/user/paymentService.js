import { Order } from "../../models/orderSchema.js"
import { ServicePlan } from '../../models/serviceModal.js';
import User from "../../models/user.js";
import { latLngToCell } from "h3-js";
import razorpay from "../../config/razorpay.js";

const H3_RESOLUTION = 8;

export const createCheckoutService = async ({
  userId,
  servicePlanId,
  servicePlanIds,
  latitude,
  longitude,
  scheduledAt,
  addressText,
  paymentMode = "ONLINE"
}) => {

  // Normalize plans
  let planIds = servicePlanIds?.length
    ? servicePlanIds
    : servicePlanId
      ? [servicePlanId]
      : [];

  if (!planIds.length) {
    throw new Error("At least one service plan is required");
  }

  // Fetch user
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  // Fetch plans
  console.log("DEBUG: Attempting to find service plans for IDs:", planIds);
  const servicePlans = await ServicePlan.find({
    _id: { $in: planIds }
  });
  console.log("DEBUG: Found service plans count:", servicePlans.length);

  if (servicePlans.length !== planIds.length) {
    console.error("DEBUG: Plan mismatch detected!", {
      providedCount: planIds.length,
      foundCount: servicePlans.length,
      providedIds: planIds,
      foundIds: servicePlans.map(p => p._id.toString())
    });
    throw new Error(`Some service plans not found or inactive. Found ${servicePlans.length} out of ${planIds.length}`);
  }

  // Price & Duration
  const totalAmount = servicePlans.reduce((sum, p) => sum + (p.price || 0), 0);

  const totalDuration = servicePlans.reduce(
    (sum, p) => sum + (p.duration || 0) + (p.bufferTime || 0),
    0
  );

  // Order Type
  let scheduleDate = null;
  let orderType = "INSTANT";

  if (scheduledAt) {
    scheduleDate = new Date(scheduledAt);

    if (isNaN(scheduleDate.getTime())) {
      throw new Error("Invalid scheduled time");
    }

    if (scheduleDate < new Date()) {
      throw new Error("Scheduled time must be future");
    }

    orderType = "SCHEDULED";
  }

  // Geo + H3
  let location = null;
  let h3Index = null;

  if (latitude !== undefined && longitude !== undefined) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng)) {
      throw new Error("Invalid coordinates");
    }

    location = {
      type: "Point",
      coordinates: [lng, lat]
    };

    h3Index = latLngToCell(lat, lng, H3_RESOLUTION);
  }

  // IDs
  const orderId = `ORD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const receipt = `receipt_${Date.now()}`;
  const servicePlanNames = servicePlans.map(p => p.name).join(",");

  //  Payment Handling
  let paymentStatus = "PENDING";
  let razorpayOrder = null;

  if (paymentMode === "ONLINE") {
    paymentStatus = "ONLINE_PENDING";

    razorpayOrder = await razorpay.orders.create({
      amount: totalAmount * 100,
      currency: "INR",
      receipt,
      notes: {
        orderId,
        servicePlanIds: planIds.join(","),
        servicePlanNames,
        userId: userId.toString(),
        serviceCount: servicePlans.length,
      },
    });

  } else if (paymentMode === "Payment After Service") {
    paymentStatus = "PAS_PENDING";
  }

  //  Order Status Logic (IMPORTANT)
  let status = "created";

  if (paymentMode === "Payment After Service") {
    status = "SEARCHING"; // directly dispatch
  }

  // Create Order
  const order = await Order.create({
    orderId,
    userId,

    servicePlans: planIds,
    servicePlan: planIds[0],

    orderType,
    scheduledAt: scheduleDate,

    amount: totalAmount,
    totalDuration,

    currency: "INR",
    receipt,

    paymentMode,
    paymentStatus,

    location,
    h3Index,
    addressText,

    status,

    razorpayOrderId: razorpayOrder?.id || null,

    customerDetails: {
      name: user.name,
      email: user.email,
      phone: user.mobile
    },

    notes: {
      servicePlanNames
    }
  });

  //  Trigger dispatch ONLY for PAS or already paid
  if (paymentMode === "Payment After Service") {
    // dispatchOrder(order._id);
  }

  return {
    order,
    razorpayOrder,
    servicePlans
  };
};



