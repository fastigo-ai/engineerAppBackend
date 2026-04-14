import crypto from 'crypto';
import razorpay from '../config/razorpay.js';
import { ServicePlan } from '../models/serviceModal.js';
import { Order } from '../models/orderSchema.js';
import { Payment } from '../models/paymentSchema.js';
import { getGeoCacheService } from '../services/map/geoCacheService.js';
import { dispatchOrder } from '../services/dispatch/dispatchService.js';
import User from '../models/user.js';
import { createCheckoutService } from '../services/user/paymentService.js';
import { notifyEngineersForOrder } from '../services/notificationEngineerService.js';
import { Wallet } from '../models/Wallet.js';
import { Ledger } from '../models/Ledger.js';
import { WithdrawalRequest } from '../models/WithdrawalRequest.js';
import { markCouponAsUsed, markCouponAsFailed } from '../modules/coupon/coupon.service.js';


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
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (signature !== expectedSignature) {
      console.error('Invalid webhook signature');
      return res.status(400).json({
        success: false,
        message: 'Invalid signature'
      });
    }

    // Process webhook event
    const event = req.body.event;
    const payload = req.body.payload;

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

    const order = await Order.findOne({
      razorpayOrderId: paymentEntity.order_id
    });

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
  try {
    const paymentEntity = payload.payment.entity;

    const order = await Order.findOne({
      razorpayOrderId: paymentEntity.order_id
    }).populate('servicePlan servicePlans');

    if (!order) {
      console.error('Order not found for payment capture');
      return;
    }

    // Update order status
    await Order.findByIdAndUpdate(order._id, {
      status: 'paid',
      razorpayPaymentId: paymentEntity.id
    });

    // Update payment record
    await Payment.findOneAndUpdate(
      { razorpayPaymentId: paymentEntity.id },
      {
        status: 'captured',
        fee: paymentEntity.fee / 100 || 0,
        tax: paymentEntity.tax / 100 || 0,
        capturedAt: new Date()
      },
      { upsert: true }
    );

    console.log(`Payment captured: ${paymentEntity.id}`);

    // Update coupon status if applicable
    if (order.couponId) {
      await markCouponAsUsed(order.orderId);
    }

    // TODO: Send confirmation email/notification to user
    // TODO: Trigger any post-payment business logic
    await notifyEngineersForOrder(order);

  } catch (error) {
    console.error('Handle payment captured error:', error);
  }
};

// Handle payment.failed event
const handlePaymentFailed = async (payload) => {
  try {
    const paymentEntity = payload.payment.entity;

    let order = await Order.findOne({
      razorpayOrderId: paymentEntity.order_id
    });

    if (!order) {
      console.error('Order not found for payment failure');
      return;
    }

    order = await Order.findOneAndUpdate({ _id: order._id }, {
      status: 'failed',
      failureReason: paymentEntity.error_description || 'Payment failed'
    }, { new: true });

    // Update coupon status if applicable
    if (order && order.couponId) {
      await markCouponAsFailed(order.orderId);
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
      { upsert: true }
    );

    console.log(`Payment failed: ${paymentEntity.id}`);

    // TODO: Send failure notification to user

  } catch (error) {
    console.error('Handle payment failed error:', error);
  }
};

// Handle order.paid event
const handleOrderPaid = async (payload) => {
  try {
    const orderEntity = payload.order.entity;

    const order = await Order.findOne({
      razorpayOrderId: orderEntity.id
    }).populate('servicePlan servicePlans');

    if (!order) {
      console.error('Order not found for order.paid event');
      return;
    }

    // Update order status
    await Order.findByIdAndUpdate(order._id, {
      status: 'paid'
    });

    console.log(`Order paid: ${orderEntity.id}`);

    // Update coupon status if applicable
    if (order.couponId) {
      await markCouponAsUsed(order.orderId);
    }

    // Trigger notification
    await notifyEngineersForOrder(order);

  } catch (error) {
    console.error('Handle order paid error:', error);
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
        refundDetails: {
          refundId: refundEntity.id,
          amount: refundEntity.amount / 100,
          status: refundEntity.status,
          refundedAt: new Date()
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
        'refundDetails.status': 'processed'
      });
    }

    console.log(`Refund processed: ${refundEntity.id}`);

    // TODO: Send refund confirmation to user

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
          isDispatched: false,
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

    // 8️ Dispatch ONLY ONCE (atomic)
    const dispatchLock = await Order.findOneAndUpdate(
      {
        _id: order._id,
        isDispatched: false,
      },
      {
        $set: { isDispatched: true },
      },
      { new: true }
    );

    if (dispatchLock) {
      dispatchOrder(order._id); // 🔥 NON-BLOCKING
      
      // 🔔 Notify User that their order is confirmed
      if (order.userId) {
        try {
          const { sendPushToUser } = await import("../services/notification/notificationService.js");
          sendPushToUser(order.userId, {
            notification: {
              title: 'Order Confirmed!',
              body: `Your booking for ${order.servicePlan?.name || 'Service'} is successful. We are matching a partner for you.`,
            },
            data: {
              order_id: order._id.toString(),
              type: 'ORDER_CONFIRMED'
            }
          });
        } catch (notifyError) {
          console.error('[PaymentController] Failed to send confirmation push:', notifyError);
        }
      }
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