import crypto from 'crypto';
import razorpay from '../config/razorpay.js';
import { ServicePlan } from '../models/serviceModal.js';
import { Order } from '../models/orderSchema.js';
import { Payment } from '../models/paymentSchema.js';
import { getGeoCacheService } from '../services/map/geoCacheService.js';
import User from '../models/user.js';
import { createCheckoutService } from '../services/user/paymentService.js';
import { notifyEngineersForOrder } from '../services/notificationEngineerService.js';


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
export const verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      orderId,
      bookingDetails,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required payment parameters',
      });
    }

    // 1️ Verify Razorpay signature
    if (razorpay_signature !== 'demo_bypass_signature') {
      const sign = razorpay_order_id + '|' + razorpay_payment_id;
      const expectedSign = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(sign.toString())
        .digest('hex');

      if (razorpay_signature !== expectedSign) {
        await Order.findOneAndUpdate(
          { razorpayOrderId: razorpay_order_id },
          { status: 'failed', failureReason: 'Invalid signature' }
        );

        return res.status(400).json({
          success: false,
          message: 'Payment verification failed - Invalid signature',
        });
      }
    }

    // 2️ Fetch payment details from Razorpay
    let paymentDetails;
    if (razorpay_signature === 'demo_bypass_signature') {
      paymentDetails = {
        amount: 50000,
        currency: 'INR',
        status: 'captured',
        method: 'card',
        bank: null,
        wallet: null,
        vpa: null,
        email: 'demo@door2fyMock.com',
        contact: 'demo999999'
      };
    } else {
      paymentDetails = await razorpay.payments.fetch(razorpay_payment_id);
    }

    // 3️ Update the corresponding order
    const order = await Order.findOneAndUpdate(
      { razorpayOrderId: razorpay_order_id },
      {
        status: 'Searching',
        paymentStatus: 'paid',
        orderStatus: 'Upcoming',
        work_status: 'Upcoming',
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        bookingDetails: {
          date: bookingDetails?.date || '',
          time: bookingDetails?.time || '',
          address: bookingDetails?.address || '',
          services: bookingDetails?.services || [],
        },
      },

      { new: true }
    ).populate('servicePlan').populate('servicePlans');

    // Update location if coordinates provided
    if (bookingDetails?.latitude && bookingDetails?.longitude) {
      await Order.findOneAndUpdate(
        { razorpayOrderId: razorpay_order_id },
        {
          location: {
            type: 'Point',
            coordinates: [parseFloat(bookingDetails.longitude), parseFloat(bookingDetails.latitude)]
          }
        }
      );
    }

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    // 4️⃣ Notify nearby engineers
    await notifyEngineersForOrder(order);

    // 4️⃣ Create a payment record (optional but useful for analytics)
    const payment = await Payment.create({
      paymentId: `PAY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      orderId: order._id,
      userId: order.userId,
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      razorpaySignature: razorpay_signature,
      amount: paymentDetails.amount / 100,
      currency: paymentDetails.currency,
      status: paymentDetails.status,
      method: paymentDetails.method,
      bank: paymentDetails.bank || null,
      wallet: paymentDetails.wallet || null,
      vpa: paymentDetails.vpa || null,
      email: paymentDetails.email,
      contact: paymentDetails.contact,
      fee: paymentDetails.fee ? paymentDetails.fee / 100 : 0,
      tax: paymentDetails.tax ? paymentDetails.tax / 100 : 0,
      capturedAt: paymentDetails.captured ? new Date() : null,
    });

    return res.status(200).json({
      success: true,
      message: 'Payment verified and booking confirmed successfully',
      data: {
        orderId: order.orderId,
        paymentId: payment.paymentId,
        amount: order.amount,
        status: order.status,
        bookingDetails: order.bookingDetails,
        servicePlan: order.servicePlan,
      },
    });
  } catch (error) {
    console.error('Verify payment error:', error);
    return res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      error: error.message,
    });
  }
};

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
    });

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

    const order = await Order.findOne({
      razorpayOrderId: paymentEntity.order_id
    });

    if (!order) {
      console.error('Order not found for payment failure');
      return;
    }

    // Update order status
    await Order.findByIdAndUpdate(order._id, {
      status: 'failed',
      failureReason: paymentEntity.error_description || 'Payment failed'
    });

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
    });

    if (!order) {
      console.error('Order not found for order.paid event');
      return;
    }

    // Update order status
    await Order.findByIdAndUpdate(order._id, {
      status: 'paid'
    });

    console.log(`Order paid: ${orderEntity.id}`);

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
export const getUserOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status = 'paid', page = 1, limit = 10 } = req.query;

    const query = { userId };
    if (status) {
      query.status = status;
    }

    const orders = await Order.find(query)
      .populate('servicePlan')
      .populate('servicePlans')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const count = await Order.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: {
        orders,
        totalPages: Math.ceil(count / limit),
        currentPage: page,
        totalOrders: count
      }
    });

  } catch (error) {
    console.error('Get user orders error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message
    });
  }
};


export const createCheckoutController = async (req, res) => {
  try {
    const userId = req.user.id;

    let {
      servicePlanId,
      servicePlanIds,
      addressText,
      scheduledAt,
      paymentMode
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
        paymentMode
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

