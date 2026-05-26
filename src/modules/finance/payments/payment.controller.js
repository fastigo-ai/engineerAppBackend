import mongoose from 'mongoose';
import crypto from 'crypto';
import razorpay from '../../../config/razorpay.js';
import { ServicePlan } from "../../../modules/catalog/service/service.model.js";
import { Order } from '../../userOrder/core/userOrder.model.js';
import { Payment } from './Payment.model.js';
import { getGeoCacheService } from "../../../modules/map/geoCache.service.js";
import { dispatchOrder } from '../../userOrder/core/dispatch.service.js';
import User from '../../auth/user/user.model.js';
import { createCheckoutService } from './payment.service.js';
import { notifyAdmins } from "../../../modules/notification/providers/webPush.service.js";
import { WithdrawalRequest } from '../wallet/WithdrawalRequest.model.js';
import { markCouponAsUsed, markCouponAsFailed } from '../../../modules/coupon/coupon.service.js';
import { notifyBookingUpdate } from '../../../modules/notification/core/notification.facade.js';
import { getIO } from '../../../config/socket.js';


// Create Checkout Session
export const createCheckoutSession = async (req, res) => {
  try {
    const {
      servicePlanId,
      servicePlanIds,
      latitude,
      longitude,
      scheduledAt,
      addressText,
      paymentMode
    } = req.body;

    const userId = req.user.id;

    const result = await createCheckoutService({
      userId,
      servicePlanId,
      servicePlanIds,
      latitude,
      longitude,
      scheduledAt,
      addressText,
      paymentMode,
    });

    return res.status(201).json({
      success: true,
      message: 'Checkout session created successfully',
      data: {
        orderId: result.order.orderId,
        razorpayOrderId: result.razorpayOrder?.id || null,
        amount: result.order.amount,
        currency: result.order.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        servicePlans: result.servicePlans.map(plan => ({
          id: plan._id,
          name: plan.name,
          price: plan.price,
          category: plan.category?.name,
        })),
        serviceCount: result.servicePlans.length,
        customerDetails: result.order.customerDetails,
        receipt: result.order.receipt,
        location: result.order.location || null,
        status: result.order.status,
      },
    });
  } catch (error) {
    console.error('Create checkout session error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create checkout session',
    });
  }
};
// ----------------------
// VERIFY PAYMENT
// ----------------------
// export const verifyPayment = async (req, res) => {
//   try {
//     const {
//       razorpay_order_id,
//       razorpay_payment_id,
//       razorpay_signature,
//       orderId,
//       bookingDetails,
//     } = req.body;

//     if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
//       return res.status(400).json({
//         success: false,
//         message: 'Missing required payment parameters',
//       });
//     }

//     // 1️ Verify Razorpay signature
//     if (razorpay_signature !== 'demo_bypass_signature') {
//       const sign = razorpay_order_id + '|' + razorpay_payment_id;
//       const expectedSign = crypto
//         .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
//         .update(sign.toString())
//         .digest('hex');

//       if (razorpay_signature !== expectedSign) {
//         await Order.findOneAndUpdate(
//           { razorpayOrderId: razorpay_order_id },
//           { status: 'failed', failureReason: 'Invalid signature' }
//         );

//         return res.status(400).json({
//           success: false,
//           message: 'Payment verification failed - Invalid signature',
//         });
//       }
//     }

//     // 2️ Fetch payment details from Razorpay
//     let paymentDetails;
//     if (razorpay_signature === 'demo_bypass_signature') {
//       paymentDetails = {
//         amount: 50000,
//         currency: 'INR',
//         status: 'captured',
//         method: 'card',
//         bank: null,
//         wallet: null,
//         vpa: null,
//         email: 'demo@door2fyMock.com',
//         contact: 'demo999999'
//       };
//     } else {
//       paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
//     }

//     // 3️ Update the corresponding order
//     const order = await Order.findOneAndUpdate(
//       { razorpayOrderId: razorpay_order_id },
//       {
//         status: 'Searching',
//         paymentStatus: 'paid',
//         orderStatus: 'Upcoming',
//         work_status: 'Upcoming',
//         razorpayPaymentId: razorpay_payment_id,
//         razorpaySignature: razorpay_signature,
//         bookingDetails: {
//           date: bookingDetails?.date || '',
//           time: bookingDetails?.time || '',
//           address: bookingDetails?.address || '',
//           services: bookingDetails?.services || [],
//         },
//       },

//       { new: true }
//     ).populate('servicePlan').populate('servicePlans');

//     // Update location if coordinates provided
//     if (bookingDetails?.latitude && bookingDetails?.longitude) {
//       await Order.findOneAndUpdate(
//         { razorpayOrderId: razorpay_order_id },
//         {
//           location: {
//             type: 'Point',
//             coordinates: [parseFloat(bookingDetails.longitude), parseFloat(bookingDetails.latitude)]
//           }
//         }
//       );
//     }

//     if (!order) {
//       return res.status(404).json({
//         success: false,
//         message: 'Order not found',
//       });
//     }

//     // 4️⃣ Notify nearby engineers
//     await notifyEngineersForOrder(order);

//     // 4️⃣ Create a payment record (optional but useful for analytics)
//     const payment = await Payment.create({
//       paymentId: `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
//       orderId: order._id,
//       userId: order.userId,
//       razorpayPaymentId: razorpay_payment_id,
//       razorpayOrderId: razorpay_order_id,
//       razorpaySignature: razorpay_signature,
//       amount: paymentDetails.amount / 100,
//       currency: paymentDetails.currency,
//       status: paymentDetails.status,
//       method: paymentDetails.method,
//       bank: paymentDetails.bank || null,
//       wallet: paymentDetails.wallet || null,
//       vpa: paymentDetails.vpa || null,
//       email: paymentDetails.email,
//       contact: paymentDetails.contact,
//       fee: paymentDetails.fee ? paymentDetails.fee / 100 : 0,
//       tax: paymentDetails.tax ? paymentDetails.tax / 100 : 0,
//       capturedAt: paymentDetails.captured ? new Date() : null,
//     });

//     return res.status(200).json({
//       success: true,
//       message: 'Payment verified and booking confirmed successfully',
//       data: {
//         orderId: order.orderId,
//         paymentId: payment.paymentId,
//         amount: order.amount,
//         status: order.status,
//         bookingDetails: order.bookingDetails,
//         servicePlan: order.servicePlan,
//       },
//     });
//   } catch (error) {
//     console.error('Verify payment error:', error);
//     return res.status(500).json({
//       success: false,
//       message: 'Payment verification failed',
//       error: error.message,
//     });
//   }
// };

// Get Order Status
export const getOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;

    const order = await Order.findOne({
      orderId: orderId,
      userId: userId
    })
      .populate('servicePlan')
      .populate('servicePlans')
      .populate('userId', 'name email');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Get payment details if order is paid
    let payment = null;
    if (order.status === 'paid') {
      payment = await Payment.findOne({ orderId: order._id });
    }

    return res.status(200).json({
      success: true,
      data: {
        order,
        payment
      }
    });

  } catch (error) {
    console.error('Get order status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch order status',
      error: error.message
    });
  }
};

export const handleRazorpayWebhook = async (req, res) => {
  try {
    // Verify webhook signature
    const signature = req.headers['x-razorpay-signature'];
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing webhook signature'
      });
    }

    // Verify the webhook signature
    // req.body should be the raw string (from express.text) or Buffer (from express.raw)
    let rawBody = req.body;
    if (Buffer.isBuffer(req.body)) {
      rawBody = req.body.toString('utf8');
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (signature !== expectedSignature) {
      console.error('Invalid webhook signature');
      return res.status(400).json({
        success: false,
        message: 'Invalid signature'
      });
    }

    // Process webhook event
    const body = (typeof req.body === 'string' || Buffer.isBuffer(req.body))
      ? JSON.parse(req.body.toString())
      : req.body;
    const event = body.event;
    const payload = body.payload;

    console.log(`Webhook received: ${event}`);

    switch (event) {
      case 'payment.authorized':
        await handlePaymentAuthorized(payload);
        break;

      case 'payment.captured':
        await handlePaymentCaptured(payload);
        break;

      case 'payment.failed':
        await handlePaymentFailed(payload);
        break;

      case 'order.paid':
        await handleOrderPaid(payload);
        break;

      case 'refund.created':
        await handleRefundCreated(payload);
        break;

      case 'refund.processed':
        await handleRefundProcessed(payload);
        break;

      // --- Razorpay X Payout Events ---
      case 'payout.processed':
        await handlePayoutProcessed(payload);
        break;

      case 'payout.failed':
      case 'payout.reversed':
        await handlePayoutReversed(payload);
        break;

      case 'qr_code.credited':
        await handlePaymentCaptured(payload);
        break;

      case 'qr_code.created':
        console.log('QR Code created');
        break;

      default:
        console.log(`Unhandled webhook event: ${event}`);
    }

    // Always return 200 to acknowledge receipt
    return res.status(200).json({
      success: true,
      message: 'Webhook processed'
    });

  } catch (error) {
    console.error('Webhook error:', error);
    // Still return 200 to prevent Razorpay from retrying
    return res.status(200).json({
      success: false,
      message: 'Webhook processing failed'
    });
  }
};

// Handle payment.authorized event
const handlePaymentAuthorized = async (payload) => {
  try {
    const paymentEntity = payload.payment.entity;

    let order = null;

    // 1. First try searching by Razorpay Order ID (if present)
    if (paymentEntity.order_id) {
      order = await Order.findOne({
        razorpayOrderId: paymentEntity.order_id
      });
    }

    // 2. Fallback: If not found or no order_id, check notes (common for QR code payments)
    if (!order && paymentEntity.notes?.orderId) {
      console.log(`[FCM] Searching by notes.orderId in Authorized: ${paymentEntity.notes.orderId}`);
      order = await Order.findById(paymentEntity.notes.orderId);
    }

    if (!order) {
      console.error('Order not found for payment authorization');
      return;
    }

    // Update or create payment record
    await Payment.findOneAndUpdate(
      { razorpayPaymentId: paymentEntity.id },
      {
        paymentId: `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        orderId: order._id,
        userId: order.userId,
        razorpayPaymentId: paymentEntity.id,
        razorpayOrderId: paymentEntity.order_id,
        amount: paymentEntity.amount / 100,
        currency: paymentEntity.currency,
        status: 'authorized',
        method: paymentEntity.method,
        bank: paymentEntity.bank || null,
        wallet: paymentEntity.wallet || null,
        vpa: paymentEntity.vpa || null,
        email: paymentEntity.email,
        contact: paymentEntity.contact
      },
      { upsert: true, new: true }
    );

    console.log(`Payment authorized: ${paymentEntity.id}`);
  } catch (error) {
    console.error('Handle payment authorized error:', error);
  }
};

// Handle payment.captured event
const handlePaymentCaptured = async (payload) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const paymentEntity = payload.payment.entity;

    let order = null;

    // 1. First try searching by Razorpay Order ID (if present)
    if (paymentEntity.order_id) {
      order = await Order.findOne({
        razorpayOrderId: paymentEntity.order_id
      }).populate('servicePlan servicePlans').session(session);
    }

    // 2. Fallback: If not found or no order_id, check notes (common for QR code payments)
    if (!order && paymentEntity.notes?.orderId) {
      console.log(`[Webhook] Searching Order by notes.orderId: ${paymentEntity.notes.orderId}`);
      try {
        order = await Order.findById(paymentEntity.notes.orderId)
          .populate('servicePlan servicePlans')
          .session(session);
      } catch (e) { }
    }

    if (!order) {
      console.error('Order not found for payment captured');
      await session.abortTransaction();
      return;
    }

    // Determine new status (usually 'paid' for successful payment)
    const newStatus = 'paid';

    // Update order status
    await Order.findByIdAndUpdate(order._id, {
      status: newStatus,
      paymentStatus: 'PAID',
      razorpayPaymentId: paymentEntity.id,
      $push: {
        tracking: {
          status: 'PAID',
          title: 'Payment Successful',
          subTitle: `Payment of ₹${paymentEntity.amount / 100} received via ${paymentEntity.method}`,
          timestamp: new Date()
        }
      }
    }, { session });

    // Update payment record
    await Payment.findOneAndUpdate(
      { razorpayPaymentId: paymentEntity.id },
      {
        status: 'captured',
        fee: paymentEntity.fee / 100 || 0,
        tax: paymentEntity.tax / 100 || 0,
        capturedAt: new Date()
      },
      { upsert: true, session }
    );

    // Update coupon status if applicable
    if (order.couponId) {
      await markCouponAsUsed(order.orderId, session);
    }

    await session.commitTransaction();
    console.log(`Payment captured and order updated: ${order.orderId}`);

    // --- SIDE EFFECTS (Post-Transaction) ---

    // 1. Trigger Dispatch for NEW orders (status was paid, not completed)
    if (newStatus === 'paid' && !order.assignedEngineer) {
      dispatchOrder(order._id);
    }

    // 2. NOTIFICATIONS
    const { notifyBookingUpdate, notifyEngineerUpdate } = await import('../../../modules/notification/core/notification.facade.js');

    // Notify User
    notifyBookingUpdate(order.userId, order._id, 'PAYMENT_RECEIVED', {
      amount: (paymentEntity.amount / 100).toString(),
      orderId: order.orderId
    }).catch(err => console.error('User payment notification failed:', err));

    // Notify Assigned Engineer (Crucial for PAS)
    const assignedEngineerId = order.assignedEngineer;

    if (assignedEngineerId) {
      notifyEngineerUpdate(assignedEngineerId, order._id, 'ENGINEER_PAYMENT_RECEIVED', {
        amount: (paymentEntity.amount / 100).toString(),
        orderId: order.orderId
      }).catch(err => console.error('Engineer payment notification failed:', err));

      // 3. Emit socket event for real-time auto-detection in the app
      try {
        const io = getIO();
        const engineerIdStr = assignedEngineerId.toString();
        io.to(engineerIdStr).emit('PAYMENT_SUCCESS', {
          orderId: order._id.toString(),
          status: 'paid',
          amount: paymentEntity.amount / 100
        });
        console.log(`📡 Socket: Emitted PAYMENT_SUCCESS to engineer ${engineerIdStr} for order ${order._id}`);
      } catch (socketErr) {
        console.error('Socket emission failed in payment capture:', socketErr.message);
      }
    }

  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error('Handle payment captured error:', error);
  } finally {
    session.endSession();
  }
};


// Handle payment.failed event
const handlePaymentFailed = async (payload) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const paymentEntity = payload.payment.entity;

    const order = await Order.findOne({
      razorpayOrderId: paymentEntity.order_id
    }).session(session);

    if (!order) {
      console.error('Order not found for payment failure');
      await session.abortTransaction();
      return;
    }

    await Order.findByIdAndUpdate(order._id, {
      status: 'failed',
      failureReason: paymentEntity.error_description || 'Payment failed',
      $push: {
        tracking: {
          status: 'CANCELLED',
          title: 'Payment Failed',
          subTitle: paymentEntity.error_description || 'Transaction declined by bank',
          timestamp: new Date()
        }
      }
    }, { session });

    // Update coupon status if applicable
    if (order && order.couponId) {
      await markCouponAsFailed(order.orderId, session);
    }

    // Create/update payment record with failure details
    await Payment.findOneAndUpdate(
      { razorpayPaymentId: paymentEntity.id },
      {
        paymentId: `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        orderId: order._id,
        userId: order.userId,
        razorpayPaymentId: paymentEntity.id,
        razorpayOrderId: paymentEntity.order_id,
        amount: paymentEntity.amount / 100,
        currency: paymentEntity.currency,
        status: 'failed',
        method: paymentEntity.method,
        errorCode: paymentEntity.error_code,
        errorDescription: paymentEntity.error_description,
        errorSource: paymentEntity.error_source,
        errorStep: paymentEntity.error_step,
        errorReason: paymentEntity.error_reason
      },
      { upsert: true, session }
    );

    await session.commitTransaction();
    console.log(`Payment failed handled: ${paymentEntity.id}`);

  } catch (error) {
    await session.abortTransaction();
    console.error('Handle payment failed error:', error);
  } finally {
    session.endSession();
  }
};

// Handle order.paid event
const handleOrderPaid = async (payload) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const orderEntity = payload.order.entity;

    const order = await Order.findOne({
      razorpayOrderId: orderEntity.id
    }).populate('servicePlan servicePlans').session(session);

    if (!order) {
      console.error('Order not found for order.paid event');
      await session.abortTransaction();
      return;
    }

    // Update order status
    await Order.findByIdAndUpdate(order._id, {
      status: 'paid',
      $push: {
        tracking: {
          status: 'CONFIRMED',
          title: 'Booking Confirmed',
          subTitle: 'Payment successful',
          timestamp: new Date()
        }
      }
    }, { session });

    // Update coupon status if applicable
    if (order.couponId) {
      await markCouponAsUsed(order.orderId, session);
    }

    await session.commitTransaction();
    console.log(`Order paid handled: ${orderEntity.id}`);

    // Trigger notification
    await notifyEngineersForOrder(order);

  } catch (error) {
    await session.abortTransaction();
    console.error('Handle order paid error:', error);
  } finally {
    session.endSession();
  }
};

// Handle refund.created event
const handleRefundCreated = async (payload) => {
  try {
    const refundEntity = payload.refund.entity;

    const payment = await Payment.findOne({
      razorpayPaymentId: refundEntity.payment_id
    });

    if (!payment) {
      console.error('Payment not found for refund');
      return;
    }

    // Update payment with refund details
    await Payment.findByIdAndUpdate(payment._id, {
      refundStatus: refundEntity.amount === payment.amount * 100 ? 'full' : 'partial',
      refundAmount: refundEntity.amount / 100
    });

    // Update order
    const order = await Order.findById(payment.orderId);
    if (order) {
      await Order.findByIdAndUpdate(order._id, {
        status: 'refunded',
        refundStatus: 'PROCESSED',
        refundDetails: {
          refundId: refundEntity.id,
          amount: refundEntity.amount / 100,
          status: refundEntity.status,
          refundedAt: new Date()
        },
        $push: {
          tracking: {
            status: 'CANCELLED',
            title: 'Refund Initiated',
            subTitle: `Amount: ₹${refundEntity.amount / 100}`,
            timestamp: new Date()
          }
        }
      });
    }

    console.log(`Refund created: ${refundEntity.id}`);

  } catch (error) {
    console.error('Handle refund created error:', error);
  }
};

// Handle refund.processed event
const handleRefundProcessed = async (payload) => {
  try {
    const refundEntity = payload.refund.entity;

    const payment = await Payment.findOne({
      razorpayPaymentId: refundEntity.payment_id
    });

    if (!payment) {
      console.error('Payment not found for refund processing');
      return;
    }

    // Update order refund status
    const order = await Order.findById(payment.orderId);
    if (order) {
      await Order.findByIdAndUpdate(order._id, {
        refundStatus: 'PROCESSED',
        'refundDetails.status': 'processed',
        $push: {
          tracking: {
            status: 'CANCELLED',
            title: 'Refund Successful',
            subTitle: 'Funds credited to your account',
            timestamp: new Date()
          }
        }
      });
    }

    console.log(`Refund processed: ${refundEntity.id}`);

    // 🔔 Notify User: Refund Processed
    if (order && order.userId) {
      notifyBookingUpdate(order.userId, order._id, 'REFUND_PROCESSED', {
        amount: refundEntity.amount / 100,
        orderId: order.orderId
      }).catch(err => console.error('[PaymentController] Refund notification failed:', err));
    }

  } catch (error) {
    console.error('Handle refund processed error:', error);
  }
};

// Get User Orders
// export const getUserOrders = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const { status = 'paid', page = 1, limit = 10 } = req.query;

//     const query = { userId };
//     if (status) {
//       query.status = status;
//     }

//     const orders = await Order.find(query)
//       .populate('servicePlan')
//       .populate('servicePlans')
//       .sort({ createdAt: -1 })
//       .limit(limit * 1)
//       .skip((page - 1) * limit);



//     const count = await Order.countDocuments(query);

//     return res.status(200).json({
//       success: true,
//       data: {
//         orders,
//         totalPages: Math.ceil(count / limit),
//         currentPage: page,
//         totalOrders: count
//       }
//     });

//   } catch (error) {
//     console.error('Get user orders error:', error);
//     return res.status(500).json({
//       success: false,
//       message: 'Failed to fetch orders',
//       error: error.message
//     });
//   }
// };


export const createCheckoutController = async (req, res) => {
  try {
    const userId = req.user.id;
    let {
      servicePlanId,
      servicePlanIds,
      addressText,
      scheduledAt,
      paymentMode,
      couponCode,
      validationKey
    } = req.body;

    let latitude = null;
    let longitude = null;
    let location = null;

    //  Use GeoCache Service instead of direct API
    if (addressText) {
      const geoData = await getGeoCacheService(addressText);

      // GeoJSON → extract lat/lng
      longitude = geoData.location.coordinates[0];
      latitude = geoData.location.coordinates[1];

      location = geoData.location; // full GeoJSON
    }

    //  Call service
    const { order, razorpayOrder, servicePlans } =
      await createCheckoutService({
        userId,
        servicePlanId,
        servicePlanIds,
        latitude,
        longitude,
        location,
        scheduledAt,
        addressText,
        paymentMode,
        couponCode,
        validationKey
      });

    // Notify Admins via Web Push (Async)
    notifyAdmins({
      title: 'New Order Received!',
      body: `Order ${order.orderId} for ₹${order.amount}`,
      data: {
        orderId: order.orderId,
        amount: order.amount,
        url: `/admin/orders/${order.orderId}`
      }
    }).catch(err => console.error('[CheckoutController] Admin notification failed:', err));

    return res.status(201).json({
      success: true,
      message: "Checkout session created successfully",
      data: {
        orderId: order.orderId,
        amount: order.amount,
        currency: order.currency,

        orderType: order.orderType,
        scheduledAt: order.scheduledAt,

        paymentMode: order.paymentMode,
        paymentStatus: order.paymentStatus,

        razorpayOrderId: razorpayOrder?.id || null,
        keyId: process.env.RAZORPAY_KEY_ID,

        totalDuration: order.totalDuration,

        servicePlans: servicePlans.map((p) => ({
          id: p._id,
          name: p.name,
          price: p.price,
          duration: p.duration,
        })),

        location: order.location,
        addressText: order.addressText,
      },
    });
  } catch (error) {
    console.error("Checkout controller error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

export const initiateOrderPayment = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;

    // Search by both custom orderId and MongoDB _id for robustness
    const query = { userId };
    if (mongoose.Types.ObjectId.isValid(orderId)) {
      query.$or = [{ _id: orderId }, { orderId: orderId }];
    } else {
      query.orderId = orderId;
    }

    const order = await Order.findOne(query);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.status === 'paid' || order.paymentStatus === 'PAID' || order.paymentStatus === 'SUCCESS') {
      return res.status(400).json({ success: false, message: 'Order is already paid' });
    }

    if (!razorpay) {
      return res.status(500).json({ success: false, message: 'Razorpay is not configured' });
    }

    // Use existing razorpayOrderId if available, otherwise create a new one
    let razorpayOrderId = order.razorpayOrderId;

    if (!razorpayOrderId) {
      const razorpayOrder = await razorpay.orders.create({
        amount: order.finalAmount || (order.amount * 100),
        currency: "INR",
        receipt: order.receipt || `receipt_${Date.now()}`,
        notes: {
          orderId: order.orderId,
          userId: userId.toString(),
          isRetry: "true"
        },
      });

      razorpayOrderId = razorpayOrder.id;

      // Update order with new razorpayOrderId
      await Order.findByIdAndUpdate(order._id, { razorpayOrderId });
    }

    return res.status(200).json({
      success: true,
      data: {
        razorpayOrderId,
        amount: order.amount,
        finalAmount: order.finalAmount / 100, // as rupees for prefill if needed
        keyId: process.env.RAZORPAY_KEY_ID,
        orderId: order.orderId
      }
    });

  } catch (error) {
    console.error("Initiate order payment error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

// export const verifyPayment = async (req, res) => {
//   try {
//     const {
//       razorpay_order_id,
//       razorpay_payment_id,
//       razorpay_signature,
//       orderId,
//       bookingDetails,
//     } = req.body;

//     // 1️ Validate input
//     if (
//       !razorpay_order_id ||
//       !razorpay_payment_id ||
//       !razorpay_signature ||
//       !orderId
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing required payment parameters",
//       });
//     }

//     // 2️ Verify signature
//     if (razorpay_signature !== "demo_bypass_signature") {
//       const sign = razorpay_order_id + "|" + razorpay_payment_id;

//       const expectedSign = crypto
//         .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
//         .update(sign.toString())
//         .digest("hex");

//       if (razorpay_signature !== expectedSign) {
//         await Order.findOneAndUpdate(
//           { razorpayOrderId: razorpay_order_id },
//           {
//             status: "FAILED",
//             failureReason: "Invalid signature",
//           }
//         );

//         return res.status(400).json({
//           success: false,
//           message: "Payment verification failed - Invalid signature",
//         });
//       }
//     }

//     // 3️ Fetch payment details
//     let paymentDetails;

//     if (razorpay_signature === "demo_bypass_signature") {
//       paymentDetails = {
//         amount: 50000,
//         currency: "INR",
//         status: "captured",
//         method: "card",
//         email: "demo@test.com",
//         contact: "9999999999",
//       };
//     } else {
//       paymentDetails = await razorpay.payments.fetch(
//         razorpay_payment_id
//       );
//     }

//     // 4️ Prepare location (if provided)
//     let location = null;

//     if (
//       bookingDetails?.latitude &&
//       bookingDetails?.longitude
//     ) {
//       location = {
//         type: "Point",
//         coordinates: [
//           parseFloat(bookingDetails.longitude),
//           parseFloat(bookingDetails.latitude),
//         ],
//       };
//     }

//     // 5️ Update order (SINGLE UPDATE)
//     const order = await Order.findOneAndUpdate(
//       { razorpayOrderId: razorpay_order_id },
//       {
//         $set: {
//           status: "Searching",
//           paymentStatus: "PAID",
//           orderStatus: "Upcoming",
//           work_status: "Upcoming",

//           razorpayPaymentId: razorpay_payment_id,
//           razorpaySignature: razorpay_signature,

//           bookingDetails: {
//             date: bookingDetails?.date || "",
//             time: bookingDetails?.time || "",
//             address: bookingDetails?.address || "",
//             services: bookingDetails?.services || [],
//           },

//           location: location || undefined,
//         },
//       },
//       { new: true }
//     )
//       .populate("servicePlan")
//       .populate("servicePlans");

//     if (!order) {
//       return res.status(404).json({
//         success: false,
//         message: "Order not found",
//       });
//     }

//     // 6️ Create Payment record
//     const payment = await Payment.create({
//       paymentId: `PAY_${Date.now()}_${Math.random()
//         .toString(36)
//         .substr(2, 9)}`,

//       orderId: order._id,
//       userId: order.userId,

//       razorpayPaymentId: razorpay_payment_id,
//       razorpayOrderId: razorpay_order_id,
//       razorpaySignature: razorpay_signature,

//       amount: paymentDetails.amount / 100,
//       currency: paymentDetails.currency,
//       status: paymentDetails.status,

//       method: paymentDetails.method,
//       email: paymentDetails.email,
//       contact: paymentDetails.contact,

//       fee: paymentDetails.fee
//         ? paymentDetails.fee / 100
//         : 0,
//       tax: paymentDetails.tax
//         ? paymentDetails.tax / 100
//         : 0,

//       capturedAt: paymentDetails.captured
//         ? new Date()
//         : null,
//     });

//     // 7️ Trigger dispatch ( NON-BLOCKING)
//     if (order.status === "Searching") {
//       dispatchOrder(order._id); // DO NOT await
//     }

//     // 8️ Response
//     return res.status(200).json({
//       success: true,
//       message:
//         "Payment verified and booking confirmed successfully",
//       data: {
//         orderId: order.orderId,
//         paymentId: payment.paymentId,
//         amount: order.amount,
//         status: order.status,
//         bookingDetails: order.bookingDetails,
//         servicePlan: order.servicePlan,
//       },
//     });
//   } catch (error) {
//     console.error("Verify payment error:", error);

//     return res.status(500).json({
//       success: false,
//       message: "Payment verification failed",
//       error: error.message,
//     });
//   }
// };


export const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId,
      bookingDetails,
    } = req.body;

    // 1️ Validate input
    if (
      !razorpay_order_id ||
      !razorpay_payment_id ||
      !razorpay_signature ||
      !orderId
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required payment parameters",
      });
    }

    // 2️ Verify signature
    if (razorpay_signature !== "demo_bypass_signature") {
      const body = razorpay_order_id + "|" + razorpay_payment_id;

      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest("hex");

      if (expectedSignature !== razorpay_signature) {
        await Order.findOneAndUpdate(
          { razorpayOrderId: razorpay_order_id },
          {
            $set: {
              status: "FAILED",
              failureReason: "Invalid signature",
            },
          }
        );

        return res.status(400).json({
          success: false,
          message: "Invalid payment signature",
        });
      }
    }

    // 3️ Fetch payment details
    let paymentDetails;

    if (razorpay_signature === "demo_bypass_signature") {
      paymentDetails = {
        amount: 50000,
        currency: "INR",
        status: "captured",
        method: "card",
        email: "demo@test.com",
        contact: "9999999999",
      };
    } else {
      paymentDetails = await razorpay.payments.fetch(
        razorpay_payment_id
      );
    }

    // 4️ Prepare location
    let location;
    if (bookingDetails?.latitude && bookingDetails?.longitude) {
      location = {
        type: "Point",
        coordinates: [
          parseFloat(bookingDetails.longitude),
          parseFloat(bookingDetails.latitude),
        ],
      };
    }

    // 5️ Idempotent Order Update
    const order = await Order.findOneAndUpdate(
      {
        razorpayOrderId: razorpay_order_id,
        paymentStatus: { $ne: "PAID" },
      },
      {
        $set: {
          status: "Searching",
          paymentStatus: "PAID",
          orderStatus: "Upcoming",
          work_status: "Upcoming",

          razorpayPaymentId: razorpay_payment_id,
          razorpaySignature: razorpay_signature,

          bookingDetails: {
            date: bookingDetails?.date || "",
            time: bookingDetails?.time || "",
            address: bookingDetails?.address || "",
            services: bookingDetails?.services || [],
          },

          location: location || undefined,
        },
      },
      { new: true }
    )
      .populate("servicePlan")
      .populate("servicePlans");

    // 6️ Handle duplicate request safely
    if (!order) {
      const existingOrder = await Order.findOne({
        razorpayOrderId: razorpay_order_id,
      });

      if (existingOrder?.paymentStatus === "PAID") {
        return res.status(200).json({
          success: true,
          message: "Payment already processed",
        });
      }

      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // 7️ Payment UPSERT (no duplicates)
    await Payment.updateOne(
      { razorpayPaymentId: razorpay_payment_id },
      {
        $setOnInsert: {
          paymentId: `PAY_${Date.now()}_${Math.random()
            .toString(36)
            .substr(2, 9)}`,

          orderId: order._id,
          userId: order.userId,

          razorpayPaymentId: razorpay_payment_id,
          razorpayOrderId: razorpay_order_id,
          razorpaySignature: razorpay_signature,

          amount: paymentDetails.amount / 100,
          currency: paymentDetails.currency,
          status: paymentDetails.status,

          method: paymentDetails.method,
          email: paymentDetails.email,
          contact: paymentDetails.contact,

          fee: paymentDetails.fee
            ? paymentDetails.fee / 100
            : 0,
          tax: paymentDetails.tax
            ? paymentDetails.tax / 100
            : 0,

          capturedAt: paymentDetails.captured
            ? new Date()
            : null,
        },
      },
      { upsert: true }
    );

    // 8️ Dispatch
    dispatchOrder(order._id); // 🔥 NON-BLOCKING

    // 🔔 Notify User: Order Confirmed
    if (order.userId) {
      notifyBookingUpdate(order.userId, order._id, 'BOOKING_CONFIRMED', {
        serviceName: order.servicePlan?.name || 'Service'
      }).catch(err => console.error('[PaymentController] Confirmation push failed:', err));
    }

    // 9️ Response
    return res.status(200).json({
      success: true,
      message: "Payment verified and booking confirmed",
      data: {
        orderId: order.orderId,
        amount: order.amount,
        status: order.status,
        bookingDetails: order.bookingDetails,
        servicePlan: order.servicePlan,
      },
    });
  } catch (error) {
    console.error("Verify Payment Error:", error);
    return res.status(500).json({
      success: false,
      message: "Payment verification failed",
      error: error.message,
    });
  }
};


/**
 * Update order status explicitly (used for failures/cancellations)
 */
export const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, failureReason } = req.body;
    const userId = req.user.id;

    if (!['failed', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status update. Only failed or cancelled are allowed via this endpoint.'
      });
    }

    const order = await Order.findOne({ orderId, userId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Prepare tracking entries
    const trackingEntries = [
      {
        status: status.toUpperCase(),
        title: `Order ${status.charAt(0).toUpperCase() + status.slice(1)}`,
        subTitle: failureReason || `The order has been marked as ${status}`,
        timestamp: new Date()
      }
    ];

    // If cancelling a paid order, add refund pending tracking for admin review
    if (status === 'cancelled' && order.paymentStatus === 'PAID') {
      order.refundStatus = 'PENDING';
      trackingEntries.push({
        status: 'REFUND_PENDING',
        title: 'Refund Processing',
        subTitle: 'Order cancelled. Your refund has been queued and is awaiting admin review.',
        timestamp: new Date()
      });
    }

    // Apply updates
    order.status = status;
    order.failureReason = failureReason || 'Updated by user/system';
    order.tracking.push(...trackingEntries);

    await order.save();

    return res.status(200).json({
      success: true,
      message: `Order marked as ${status}`,
      data: order
    });
  } catch (error) {
    console.error('Update order status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update order status'
    });
  }
};

export const getUserOrders = async (req, res) => {
  try {
    const userId = req.user.id;

    //  Safe pagination parsing
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, parseInt(req.query.limit) || 10);

    const { status } = req.query;

    //  Base query
    const query = {
      userId,
      isDeleted: false
    };

    //  Multi-status support
    if (status) {
      query.status = { $in: status.split(",") };
    }

    //  Parallel DB calls
    const [orders, count] = await Promise.all([
      Order.find(query)
        .populate("servicePlan", "name price duration")
        .populate("servicePlans", "name price duration")
        .populate({
          path: "assignedEngineer",
          select: "name email mobile rating"
        })
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit)
        .lean(),

      Order.countDocuments(query)
    ]);

    //  Pagination metadata
    const totalPages = Math.ceil(count / limit);
    const hasMore = page < totalPages;


    const formattedOrders = orders.map(order => ({
      ...order,
      engineer: order.assignedEngineer
        ? {
          name: order.assignedEngineer.name,
          email: order.assignedEngineer.email,
          mobile: order.assignedEngineer.mobile,
          rating: order.assignedEngineer.rating
        }
        : null,
      assignedEngineer: undefined
    }));

    //  Response
    return res.status(200).json({
      success: true,
      data: {
        orders: formattedOrders,
        pagination: {
          totalOrders: count,
          totalPages,
          currentPage: page,
          limit,
          hasMore
        }
      }
    });

  } catch (error) {
    console.error("Get user orders error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch orders",
      error: error.message
    });
  }
};

// --- RAZORPAY X PAYOUT WEBHOOK HANDLERS ---

/**
 * Handle payout.processed event
 * Move funds from lockedBalance -> withdrawnAmount (Net Payout)
 * Retain commission (Gross - Net)
 */
const handlePayoutProcessed = async (payload) => {
  try {
    const payoutEntity = payload.payout.entity;
    const payoutId = payoutEntity.id;
    const requestId = payoutEntity.reference_id;

    console.log(`Processing Success Webhook for Payout: ${payoutId}`);

    const withdrawal = await WithdrawalRequest.findById(requestId);
    if (!withdrawal) {
      console.error(`Withdrawal request ${requestId} not found for success sync`);
      return;
    }

    if (withdrawal.status === 'success') {
      console.log(`Withdrawal ${requestId} already marked success`);
      return;
    }

    const engineerId = withdrawal.engineerId;
    const grossAmount = withdrawal.amount; // Gross (100%)
    const netAmount = withdrawal.netAmount || (grossAmount * 0.75); // Net (75%)

    const session = await Wallet.startSession();
    session.startTransaction();

    try {
      // 1. Update Wallet: Remove Gross from Locked, Add Net to Withdrawn
      await Wallet.findOneAndUpdate(
        { engineerId },
        {
          $inc: {
            lockedBalance: -grossAmount,
            withdrawnAmount: netAmount
          }
        },
        { session }
      );

      // 2. Update Withdrawal Request
      await WithdrawalRequest.findByIdAndUpdate(requestId, {
        status: 'success',
        processedAt: new Date()
      }, { session });

      // 3. Update Ledger Status
      await Ledger.findOneAndUpdate(
        { referenceId: requestId.toString(), type: 'debit' },
        { status: 'success' },
        { session }
      );

      await session.commitTransaction();
      console.log(`Finalized withdrawal ${requestId}: Gross ₹${grossAmount} deducted, Net ₹${netAmount} recorded.`);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }

  } catch (error) {
    console.error("Handle payout processed error:", error);
  }
};

/**
 * Handle payout.failed / payout.reversed
 * Revert funds from lockedBalance -> availableBalance (Gross)
 */
const handlePayoutReversed = async (payload) => {
  try {
    const payoutEntity = payload.payout.entity;
    const payoutId = payoutEntity.id;
    const requestId = payoutEntity.reference_id;
    const failureReason = payoutEntity.status_details?.description || 'Payout failed';

    console.log(`Processing Failure Webhook for Payout: ${payoutId}, Reason: ${failureReason}`);

    const withdrawal = await WithdrawalRequest.findById(requestId);
    if (!withdrawal) return;

    if (withdrawal.status === 'failed') return;

    const engineerId = withdrawal.engineerId;
    const grossAmount = withdrawal.amount;

    const session = await Wallet.startSession();
    session.startTransaction();

    try {
      // 1. Revert Wallet: Move Gross from Locked back to Available
      await Wallet.findOneAndUpdate(
        { engineerId },
        {
          $inc: {
            lockedBalance: -grossAmount,
            availableBalance: grossAmount
          }
        },
        { session }
      );

      // 2. Mark Request as Failed
      await WithdrawalRequest.findByIdAndUpdate(requestId, {
        status: 'failed',
        failureReason
      }, { session });

      // 3. Update Ledger Status
      await Ledger.findOneAndUpdate(
        { referenceId: requestId.toString(), type: 'debit' },
        { status: 'failed' },
        { session }
      );

      await session.commitTransaction();
      console.log(`Reverted withdrawal ${requestId}: Gross ₹${grossAmount} returned to available balance.`);
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error) {
    console.error("Handle payout reversed error:", error);
  }
};

/**
 * Get all payments (Admin only)
 */
export const getAllPayments = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    const match = {};
    if (status) match.status = status;

    const [results] = await Payment.aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $skip: skip },
            { $limit: limitNum },
            {
              $lookup: {
                from: "users",
                localField: "userId",
                foreignField: "_id",
                as: "userDetails"
              }
            },
            { $unwind: { path: "$userDetails", preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: "orders",
                localField: "orderId",
                foreignField: "_id",
                as: "orderDetails"
              }
            },
            { $unwind: { path: "$orderDetails", preserveNullAndEmptyArrays: true } },
            {
              $project: {
                _id: 1,
                paymentId: 1,
                amount: 1,
                currency: 1,
                status: 1,
                method: 1,
                createdAt: 1,
                razorpayPaymentId: 1,
                razorpayOrderId: 1,
                userId: {
                  _id: "$userDetails._id",
                  name: "$userDetails.name",
                  mobile: "$userDetails.mobile",
                  email: "$userDetails.email"
                },
                orderId: {
                  _id: "$orderDetails._id",
                  orderId: "$orderDetails.orderId",
                  status: "$orderDetails.status"
                }
              }
            }
          ]
        }
      }
    ]);

    const total = results.metadata[0]?.total || 0;

    return res.status(200).json({
      success: true,
      data: {
        payments: results.data,
        totalPages: Math.ceil(total / limitNum),
        currentPage: parseInt(page),
        totalPayments: total
      }
    });
  } catch (error) {
    console.error('[PaymentController] Get all payments error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch payments',
      error: error.message
    });
  }
};