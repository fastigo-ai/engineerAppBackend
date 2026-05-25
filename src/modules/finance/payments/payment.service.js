import mongoose from 'mongoose';
import { Order } from "../../../models/orderSchema.js"
import { ServicePlan } from "../../../modules/catalog/service/service.model.js";
import User from "../../../models/user.js";
import { latLngToCell } from "h3-js";
import { dispatchOrder } from "../../../services/dispatch/dispatchService.js";
import razorpay from "../../../config/razorpay.js";
import { validateCoupon, reserveCoupon } from "../../../modules/coupon/coupon.service.js";
import { verifyValidationKey } from "../../../modules/coupon/coupon.validator.js";

const H3_RESOLUTION = 8;

export const createCheckoutService = async ({
  userId,
  servicePlanId,
  servicePlanIds,
  latitude,
  longitude,
  scheduledAt,
  addressText,
  paymentMode = "ONLINE",
  couponCode,
  validationKey
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
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
    const user = await User.findById(userId).session(session);
    if (!user) throw new Error("User not found");

    // Fetch plans
    const servicePlans = await ServicePlan.find({
      _id: { $in: planIds }
    }).session(session);

    if (servicePlans.length !== planIds.length) {
      throw new Error(`Some service plans not found or inactive.`);
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
      if (isNaN(scheduleDate.getTime())) throw new Error("Invalid scheduled time");
      
      const leadTimeBuffer = 15 * 60 * 1000; // 15 minutes
      if (scheduleDate < new Date(Date.now() + leadTimeBuffer)) {
        throw new Error("Booking must be scheduled at least 15 minutes in advance");
      }
      orderType = "SCHEDULED";
    }

    // Geo + H3
    let location = null;
    let h3Index = null;
    if (latitude !== undefined && longitude !== undefined) {
      const lat = parseFloat(latitude);
      const lng = parseFloat(longitude);
      location = { type: "Point", coordinates: [lng, lat] };
      h3Index = latLngToCell(lat, lng, H3_RESOLUTION);
    }

    const orderId = `ORD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const receipt = `receipt_${Date.now()}`;
    const servicePlanNames = servicePlans.map(p => p.name).join(",");

    // --- Coupon Logic ---
    let discountAmount = 0;
    let finalAmountInPaise = totalAmount * 100;
    let couponId = null;

    if (couponCode) {
      const amountInPaise = totalAmount * 100;
      const validationResult = await validateCoupon({
        userId,
        couponCode,
        amount: amountInPaise,
        servicePlans: planIds
      });

      const isValid = verifyValidationKey({
        userId,
        couponId: validationResult.coupon._id,
        amount: amountInPaise,
        validationKey
      });

      if (!isValid) {
        throw new Error("Invalid or tampered coupon validation key");
      }

      // Reserve coupon (Pass the session!)
      await reserveCoupon({
        userId,
        couponId: validationResult.coupon._id,
        orderId
      }, session);

      discountAmount = validationResult.discount;
      finalAmountInPaise = validationResult.finalAmount;
      couponId = validationResult.coupon._id;
    }

    // Payment Handling (External API)
    let paymentStatus = "PENDING";
    let razorpayOrder = null;

    if (paymentMode === "ONLINE") {
      paymentStatus = "ONLINE_PENDING";
      razorpayOrder = await razorpay.orders.create({
        amount: finalAmountInPaise,
        currency: "INR",
        receipt,
        notes: {
          orderId,
          userId: userId.toString(),
          couponCode: couponCode || "NONE",
        },
      });
    } else if (paymentMode === "Payment After Service") {
      paymentStatus = "PAS_PENDING";
    }

    let status = paymentMode === "Payment After Service" ? "Searching" : "created";

    // Create Order (Pass the session!)
    const [order] = await Order.create([{
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
      couponId,
      discountAmount,
      finalAmount: finalAmountInPaise,
      customerDetails: {
        name: user.name,
        email: user.email,
        phone: user.mobile
      },
      notes: { servicePlanNames },
      tracking: [{
        status: 'CONFIRMED',
        title: 'Booking Confirmed',
        timestamp: new Date()
      }]
    }], { session });

    await session.commitTransaction();

    if (paymentMode === "Payment After Service") {
      dispatchOrder(order._id);

      //  Notify User: Booking Confirmed (PAS)
      import("../../../modules/notification/core/notification.facade.js").then(({ notifyBookingUpdate }) => {
        notifyBookingUpdate(userId, order._id, 'BOOKING_CONFIRMED', {
          serviceName: servicePlans[0]?.name || 'Service'
        });
      }).catch(err => console.error('[CheckoutService] Notification failed:', err));
    }

    return { order, razorpayOrder, servicePlans };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

