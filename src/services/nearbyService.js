import { Order } from "../models/orderSchema.js";
import VendorOrder from "../models/vendorOrderModal.js";
import { gridDisk } from "h3-js";

const USER_RADIUS_RINGS = 12; // ~10km
const VENDOR_RADIUS_RINGS = 30; // ~25km
const MAX_ORDERS = 15; // increased for mixed orders

export const getNearbyOrdersService = async ({ engineer, type = "all" }) => {
  if (!engineer.h3Index) {
    throw new Error("Engineer location not available");
  }

  // Aggregate all orders within separate radii
  const allRegularOrders = [];
  const allVendorOrders = [];

  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // 1. Fetch Regular (User) Orders (within 10km / 12 rings)
  if (type === "all" || type === "user") {
    const userCells = gridDisk(engineer.h3Index, USER_RADIUS_RINGS);
    const regularOrders = await Order.find({
      h3Index: { $in: userCells },
      status: { $in: ["Searching", "created", "paid", "pending"] },
      assignedEngineer: null,
      isDeleted: { $ne: true },
      rejectedBy: { $ne: engineer._id },
      work_status: { $nin: ["Completed", "Cancelled"] },
      $or: [
        { orderType: "INSTANT" },
        { 
          orderType: "SCHEDULED", 
          scheduledAt: { $gte: new Date() } // Show only future scheduled orders
        }
      ]
    })
      .select("orderId location amount totalDuration orderType scheduledAt addressText customerDetails servicePlan servicePlans created_at createdAt notes bookingDetails paymentMode paymentStatus")
      .sort({ createdAt: -1 })
      .limit(MAX_ORDERS)
      .lean();
    
    allRegularOrders.push(...regularOrders);
  }

  // 2. Fetch Vendor Orders (within 25km / 30 rings)
  if (type === "all" || type === "vendor") {
    const vendorCells = gridDisk(engineer.h3Index, VENDOR_RADIUS_RINGS);
    const vendorOrders = await VendorOrder.find({
      h3Index: { $in: vendorCells },
      status: "PENDING",
      assigned_engineer_id: null,
      rejected_engineers: { $ne: engineer._id }
    })
      .select("call_id location order_price support_type branch_name complete_address created_at payment_status payout_amount description sop")
      .sort({ created_at: -1 })
      .limit(MAX_ORDERS)
      .lean();
    
    allVendorOrders.push(...vendorOrders);
  }

  console.log(`🔍 Nearby Search: Found ${allRegularOrders.length} user orders (10km), ${allVendorOrders.length} vendor orders (25km)`);

  // 3. Mark types, unify address, and STRICTLY REDACT sensitive info
  const mappedRegular = allRegularOrders.map(o => {
    // Completely remove sensitive keys from the spread
    const { addressText, location, customerDetails, ...safeOrder } = o;
    return { 
      ...safeOrder, 
      isVendorOrder: false,
      address: "Hidden until acceptance",
      customerName: "Customer",
      customerPhone: "Hidden",
      // Include non-sensitive job details
      bookingDetails: o.bookingDetails ? {
        services: o.bookingDetails.services,
        category: o.bookingDetails.category,
        description: o.bookingDetails.description
      } : undefined,
      notes: o.notes
    };
  });

  const mappedVendor = allVendorOrders.map(o => {
    const { complete_address, location, contact_phone, contact_name, ...safeOrder } = o;
    return { 
      ...safeOrder, 
      isVendorOrder: true,
      address: "Hidden until acceptance",
      customerName: "Customer",
      customerPhone: "Hidden"
    };
  });

  const merged = [...mappedRegular, ...mappedVendor].sort((a, b) => {
    const timeA = new Date(a.createdAt || a.created_at).getTime();
    const timeB = new Date(b.createdAt || b.created_at).getTime();
    return timeB - timeA; // Newest first
  });

  return merged.slice(0, MAX_ORDERS);

  return foundOrders;
};
