import { Order } from "../models/orderSchema.js";
import VendorOrder from "../models/vendorOrderModal.js";
import { Payment } from "../models/paymentSchema.js";
import { Engineer } from "../models/engineersModal.js";
import { gridDisk } from "h3-js";

export const getEngineerStatsService = async (engineerId) => {
  // 1. Get basic counts for Standard Orders
  const standardOrdersPromise = Order.find({
    assignedEngineer: engineerId
  }).select('status work_status amount').lean();

  // 2. Get basic counts for Vendor Orders
  const vendorOrdersPromise = VendorOrder.find({
    assigned_engineer_id: engineerId
  }).select('status work_status order_price payout_amount').lean();


  // 3. Get total verified payments for Standard Orders
  const verifiedPaymentsPromise = Order.aggregate([
    { $match: { assignedEngineer: engineerId, status: "paid" } },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]);


  const [standardOrders, vendorOrders, verifiedPayments] = await Promise.all([
    standardOrdersPromise,
    vendorOrdersPromise,
    verifiedPaymentsPromise
  ]);

  // --- PROCESSING STANDARD ORDERS ---
  const stdCompleted = standardOrders.filter(o => o.work_status === "Completed");
  const stdInProgress = standardOrders.filter(o => o.work_status === "In Progress" || o.work_status === "Started" || o.work_status === "STARTED");
  const stdActive = standardOrders.filter(o => o.work_status === "Accepted" || o.work_status === "ACCEPTED");

  // --- PROCESSING VENDOR ORDERS ---
  const vendorCompleted = vendorOrders.filter(o => o.work_status === "COMPLETED");
  const vendorInProgress = vendorOrders.filter(o => o.work_status === "IN_PROGRESS" || o.work_status === "STARTED" || o.work_status === "Started");
  const vendorActive = vendorOrders.filter(o => o.work_status === "ACCEPTED");

  // --- EARNINGS CALCULATION ---
  // Standard Earning: Sum of amounts from Orders where status is 'paid' 
  // (Verification: we use the payment model sum we calculated earlier)
  const standardEarnings = verifiedPayments[0]?.total || 0;

  // Vendor Earning: Sum of payout_amount for completed vendor orders
  const vendorEarnings = vendorCompleted.reduce((sum, order) => sum + (order.payout_amount || 0), 0);

  return {
    summary: {
      totalEarnings: standardEarnings + vendorEarnings,
      totalCompletedOrders: stdCompleted.length + vendorCompleted.length,
      totalActiveOrders: stdActive.length + vendorActive.length, // Now explicitly Active
      totalInProgressOrders: stdInProgress.length + vendorInProgress.length, // New field
    },
    details: {
      standard: {
        completed: stdCompleted.length,
        inProgress: stdInProgress.length,
        active: stdActive.length,
        verifiedEarnings: standardEarnings
      },
      vendor: {
        completed: vendorCompleted.length,
        inProgress: vendorInProgress.length,
        active: vendorActive.length,
        payoutEarnings: vendorEarnings
      }
    }
  };
};

export const goOnlineService = async ({ engineerId, lat, lng }) => {

  if (
    lat === undefined ||
    lng === undefined ||
    isNaN(lat) ||
    isNaN(lng)
  ) {
    throw new Error("Valid latitude and longitude are required");
  }

  const engineer = await Engineer.findOneAndUpdate(
    {
      _id: engineerId,
      isActive: true,
      isDeleted: false,
      isBlocked: false,
      isSuspended: false,
      status: { $ne: "BUSY" } // prevent override
    },
    {
      $set: {
        status: "ONLINE",
        location: {
          type: "Point",
          coordinates: [parseFloat(lng), parseFloat(lat)]
        }
      }
    },
    {
      new: true,
      runValidators: true
    }
  );

  if (!engineer) {
    throw new Error("Engineer not found or not eligible to go online");
  }

  return {
    success: true,
    message: "Engineer is now online",
    data: engineer
  };
};

export const goOfflineService = async ({ engineerId }) => {
  const engineer = await Engineer.findOneAndUpdate(
    {
      _id: engineerId,
      isActive: true,
      isDeleted: false
    },
    {
      $set: {
        status: "OFFLINE"
      }
    },
    { new: true }
  );

  if (!engineer) {
    throw new Error("Engineer not found");
  }

  return engineer;
};

export const heartbeatService = async ({ engineerId }) => {
  const now = new Date();

  const engineer = await Engineer.findOneAndUpdate(
    {
      _id: engineerId,
      status: "ONLINE"
    },
    {
      $set: {
        lastHeartbeat: now
      }
    },
    { new: true }
  );

  if (!engineer) {
    throw new Error("Engineer not online or not found");
  }

  return {
    success: true,
    message: "Heartbeat updated"
  };
};

export const updateLocationService = async ({ engineerId, lat, lng }) => {
  //  validation
  if (
    lat === undefined ||
    lng === undefined ||
    isNaN(lat) ||
    isNaN(lng)
  ) {
    throw new Error("Valid latitude and longitude required");
  }

  const engineer = await Engineer.findById(engineerId);

  if (!engineer) {
    throw new Error("Engineer not found");
  }

  //  THROTTLE: avoid frequent DB writes
  if (
    engineer.lastLocationUpdate &&
    Date.now() - engineer.lastLocationUpdate.getTime() < 10000
  ) {
    return {
      success: true,
      message: "Location update skipped (throttled)"
    };
  }

  await Engineer.updateOne(
    { _id: engineerId },
    {
      $set: {
        location: {
          type: "Point",
          coordinates: [parseFloat(lng), parseFloat(lat)]
        }
      }
    }
  );

  return {
    success: true,
    message: "Location updated"
  };
};

export const dispatchOrder = async (orderId) => {

  const order = await Order.findById(orderId);
  if (!order || order.status !== "SEARCHING") return;

  //  Step 1: Get nearby H3 cells
  const cells = gridDisk(order.h3Index, 2);

  //  Step 2: Find engineers
  const engineers = await Engineer.find({
    h3Index: { $in: cells },
    status: "ONLINE",
    lastHeartbeat: { $gte: new Date(Date.now() - 15000) } // alive
  });

  //  Step 3: Filter by availability
  const availableEngineers = [];

  for (let eng of engineers) {
    const isFree = await checkEngineerAvailability(eng._id, order);

    if (isFree) {
      availableEngineers.push(eng);
    }
  }

  //  Step 4: Sort (simple)
  availableEngineers.sort((a, b) => a.rating - b.rating);

  //  Step 5: Send to top engineers (batch)
  const topEngineers = availableEngineers.slice(0, 5);

  for (let eng of topEngineers) {
    await sendOrderRequest(eng, order);
  }
};