import { Order } from '../../userOrder/core/userOrder.model.js';
import VendorOrder from '../../vendorOrder/core/vendorOrder.model.js';
import { Payment } from "../../finance/payments/Payment.model.js";
import { Engineer } from "../../auth/engineer/engineer.model.js";
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

  // 4. Get Wallet Balance
  const { Wallet } = await import("../../../models/Wallet.js");
  const walletPromise = Wallet.findOne({ engineerId }).select('availableBalance').lean();


  const [standardOrders, vendorOrders, verifiedPayments, wallet] = await Promise.all([
    standardOrdersPromise,
    vendorOrdersPromise,
    verifiedPaymentsPromise,
    walletPromise
  ]);

  // --- PROCESSING STANDARD ORDERS ---
  const stdCompleted = standardOrders.filter(o => o.work_status === "Completed");
  // In Progress: Work has started but not completed
  const stdInProgress = standardOrders.filter(o => ["In Progress", "Started", "STARTED"].includes(o.work_status));
  // Active: Accepted but work not yet started
  const stdActive = standardOrders.filter(o => ["Accepted", "ACCEPTED"].includes(o.work_status));

  // --- PROCESSING VENDOR ORDERS ---
  const vendorCompleted = vendorOrders.filter(o => o.work_status === "COMPLETED");
  // In Progress: Work has started but not completed
  const vendorInProgress = vendorOrders.filter(o => ["IN_PROGRESS", "STARTED", "Started"].includes(o.work_status));
  // Active: Accepted but work not yet started (Status is ACCEPTED and work_status is NOT_STARTED or similar)
  const vendorActive = vendorOrders.filter(o =>
    (o.status === "ACCEPTED" || o.work_status === "ACCEPTED") &&
    !["IN_PROGRESS", "STARTED", "Started", "COMPLETED"].includes(o.work_status)
  );

  // --- EARNINGS CALCULATION ---
  // Standard Earning: Sum of amounts from Orders where status is 'paid' 
  // (Verification: we use the payment model sum we calculated earlier)
  const standardEarnings = verifiedPayments[0]?.total || 0;

  // Vendor Earning: Sum of payout_amount for completed vendor orders
  const vendorEarnings = vendorCompleted.reduce((sum, order) => sum + (order.payout_amount || 0), 0);

  return {
    summary: {
      totalEarnings: wallet?.availableBalance || 0, // Using wallet balance as per user request
      actualLifetimeEarnings: standardEarnings + vendorEarnings,
      totalCompletedOrders: stdCompleted.length + vendorCompleted.length,
      totalActiveOrders: stdActive.length + vendorActive.length,
      totalInProgressOrders: stdInProgress.length + vendorInProgress.length,
      walletBalance: wallet?.availableBalance || 0
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
      isActive: true
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
  const { getDistanceInMeters } = await import("../utils/distance.js");

  for (let eng of topEngineers) {
    if (eng.location?.coordinates && order.location?.coordinates) {
      const dist = getDistanceInMeters(
        order.location.coordinates[1],
        order.location.coordinates[0],
        eng.location.coordinates[1],
        eng.location.coordinates[0]
      );
      eng.distanceKm = +(dist / 1000).toFixed(2);
    } else {
      eng.distanceKm = 0;
    }
    await sendOrderRequest(eng, order);
  }
};