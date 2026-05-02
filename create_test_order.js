import mongoose from 'mongoose';
import { Order } from './src/models/orderSchema.js';

const uri = "mongodb+srv://fastigolvtltd:pfvA2CwhHE61mO3z@cluster0.knkkbr1.mongodb.net/door2fy";

async function createTestOrder() {
  try {
    await mongoose.connect(uri);
    console.log("Connected to MongoDB");

    const orderData = {
      orderId: 'ORD_PAS_' + Math.random().toString(36).substr(2, 5).toUpperCase(),
      userId: '693426079b9baab81a3f55c8',
      assignedEngineer: '694ff71d13c64ff26dad7cf2',
      title: 'Charging Power Issue',
      amount: 1,
      finalAmount: 100, // 1 Rupee in Paise
      currency: 'INR',
      paymentMode: 'Payment After Service',
      paymentStatus: 'PENDING',
      status: 'Searching', 
      orderStatus: 'Accepted',
      work_status: 'Accepted',
      scheduledAt: new Date('2026-05-02T12:21:00+05:30'),
      location: { type: 'Point', coordinates: [77.3832567, 28.6182883] },
      addressText: 'Noida Sector 62',
      isOtpVerified: false,
      otp: '1111',
      tracking: [{
        status: 'ACCEPTED',
        title: 'Order Accepted',
        timestamp: new Date()
      }]
    };

    const order = await Order.create(orderData);
    console.log("Test Order Created Successfully:", order.orderId);
    console.log("Order ID (_id):", order._id);
    
    process.exit(0);
  } catch (error) {
    console.error("Error creating order:", error);
    process.exit(1);
  }
}

createTestOrder();
