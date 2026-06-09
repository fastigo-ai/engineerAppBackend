import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { Engineer } from './src/modules/auth/engineer/engineer.model.js';
import { Order } from './src/modules/userOrder/core/userOrder.model.js';
import VendorOrder from './src/modules/vendorOrder/core/vendorOrder.model.js';

async function fix() {
  await mongoose.connect(process.env.MONGO_URI);
  const engineer = await Engineer.findOne({ name: 'Test Engineer' });
  if (!engineer) {
    console.log('Test Engineer not found');
    process.exit(0);
  }
  console.log('Found engineer:', engineer._id);
  
  // Find all standard orders
  const std = await Order.find({ assignedEngineer: engineer._id });
  console.log('Standard orders assigned:', std.length);
  for (const o of std) {
     o.assignedEngineer = null;
     o.acceptedBy = null;
     o.orderStatus = 'Upcoming';
     o.work_status = 'Upcoming';
     o.status = 'Searching';
     await o.save();
     console.log('Fixed standard order', o._id);
  }

  // Find all vendor orders
  const ven = await VendorOrder.find({ assigned_engineer_id: engineer._id });
  console.log('Vendor orders assigned:', ven.length);
  for (const o of ven) {
     o.assigned_engineer_id = null;
     o.status = 'PENDING';
     o.work_status = 'NOT_STARTED';
     o.accepted_at = null;
     await o.save();
     console.log('Fixed vendor order', o._id);
  }

  // Clear engineer assignedOrders
  engineer.assignedOrders = [];
  engineer.isAvailable = true;
  await engineer.save();
  console.log('Cleared engineer assignedOrders');

  process.exit(0);
}
fix();
