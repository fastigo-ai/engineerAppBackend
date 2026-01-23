import { Order } from "../models/orderSchema.js";
import VendorOrder from "../models/vendorOrderModal.js";
import { Payment } from "../models/paymentSchema.js";
import { Engineer } from "../models/engineersModal.js";

export const getEngineerStatsService = async (engineerId) => {
  // 1. Get basic counts for Standard Orders
  const standardOrdersPromise = Order.find({
    assignedEngineer: engineerId
  }).select('status work_status amount').lean();

  // 2. Get basic counts for Vendor Orders
  const vendorOrdersPromise = VendorOrder.find({
    assigned_engineer_id: engineerId
  }).select('status work_status order_price payout_amount').lean();

  // 3. Get Verified Payments from Payment Model (Standard Orders only)
  // We filter for 'captured' or 'authorized' to ensure the money is real
  // const verifiedPaymentsPromise = Payment.aggregate([
  //   { $match: { userId: engineerId, status: "captured" } },
  //   { $group: { _id: null, total: { $sum: "$amount" } } }
  // ]);

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
  const stdInProgress = standardOrders.filter(o => o.work_status === "In Progress" || o.work_status === "Accepted");

  // --- PROCESSING VENDOR ORDERS ---
  const vendorCompleted = vendorOrders.filter(o => o.work_status === "COMPLETED");
  const vendorInProgress = vendorOrders.filter(o => o.work_status === "IN_PROGRESS");

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
      totalActiveOrders: stdInProgress.length + vendorInProgress.length,
    },
    details: {
      standard: {
        completed: stdCompleted.length,
        inProgress: stdInProgress.length,
        verifiedEarnings: standardEarnings
      },
      vendor: {
        completed: vendorCompleted.length,
        inProgress: vendorInProgress.length,
        payoutEarnings: vendorEarnings
      }
    }
  };
};