import { Order } from "../models/orderSchema.js";
import VendorOrder from "../models/vendorOrderModal.js";
import { gridDisk } from "h3-js";

const MAX_RADIUS = 5; // expand search
const MAX_ORDERS = 15; // increased for mixed orders

export const getNearbyOrdersService = async ({ engineer, type = "all" }) => {
  if (!engineer.h3Index) {
    throw new Error("Engineer location not available");
  }

  let foundOrders = [];

  // Aggregate all orders within MAX_RADIUS before limiting
  const allRegularOrders = [];
  const allVendorOrders = [];
  const processedRegularIds = new Set();
  const processedVendorIds = new Set();

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

  for (let radius = 1; radius <= MAX_RADIUS; radius++) {
    const cells = gridDisk(engineer.h3Index, radius);
    const now = new Date();

    // 1. Fetch Regular (User) Orders (Only if type is 'all' or 'user')
    if (type === "all" || type === "user") {
      const regularOrders = await Order.find({
        h3Index: { $in: cells },
        status: { $in: ["Searching", "created", "paid", "pending"] },
        assignedEngineer: null,
        isDeleted: { $ne: true },
        rejectedBy: { $ne: engineer._id },
        work_status: { $nin: ["Completed", "Cancelled"] },
        $or: [
          { orderType: "INSTANT" },
          { 
            orderType: "SCHEDULED", 
            scheduledAt: { $lte: tomorrow } // Show orders for today/tomorrow
          }
        ]
      })
        .select("orderId location amount totalDuration orderType scheduledAt addressText customerDetails servicePlan servicePlans created_at createdAt notes bookingDetails paymentMode paymentStatus")
        .sort({ createdAt: -1 })
        .lean();

      regularOrders.forEach(o => {
        if (!processedRegularIds.has(o._id.toString())) {
          allRegularOrders.push(o);
          processedRegularIds.add(o._id.toString());
        }
      });
    }

    // 2. Fetch Vendor Orders (Only if type is 'all' or 'vendor')
    if (type === "all" || type === "vendor") {
      const vendorOrders = await VendorOrder.find({
        h3Index: { $in: cells },
        status: "PENDING",
        assigned_engineer_id: null,
        rejected_engineers: { $ne: engineer._id }
      })
        .select("call_id location order_price support_type branch_name complete_address created_at payment_status payout_amount")
        .sort({ created_at: -1 })
        .lean();

      vendorOrders.forEach(o => {
        if (!processedVendorIds.has(o._id.toString())) {
          allVendorOrders.push(o);
          processedVendorIds.add(o._id.toString());
        }
      });
    }
  }

  console.log(`🔍 Nearby Search: Found ${allRegularOrders.length} user orders, ${allVendorOrders.length} vendor orders within ${MAX_RADIUS}km`);

  // 3. Mark types, unify address, and REDACT sensitive customer info
  const mappedRegular = allRegularOrders.map(o => ({ 
    ...o, 
    isVendorOrder: false,
    address: o.addressText || o.bookingDetails?.address || "Address available after acceptance",
    customerDetails: {
      name: "Customer",
      phone: "Hidden"
    }
  }));

  const mappedVendor = allVendorOrders.map(o => ({ 
    ...o, 
    isVendorOrder: true,
    address: o.complete_address || o.address || "Address available after acceptance",
    contact_name: "Customer",
    contact_phone: "Hidden"
  }));

  const merged = [...mappedRegular, ...mappedVendor].sort((a, b) => {
    const timeA = new Date(a.createdAt || a.created_at).getTime();
    const timeB = new Date(b.createdAt || b.created_at).getTime();
    return timeB - timeA; // Newest first
  });

  return merged.slice(0, MAX_ORDERS);

  return foundOrders;
};
