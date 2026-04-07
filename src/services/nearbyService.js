import { Order } from "../models/orderSchema.js";
import VendorOrder from "../models/vendorOrderModal.js";
import { gridDisk } from "h3-js";

const MAX_RADIUS = 5; // expand search
const MAX_ORDERS = 15; // increased for mixed orders

export const getNearbyOrdersService = async ({ engineer }) => {
  if (!engineer.h3Index) {
    throw new Error("Engineer location not available");
  }

  let foundOrders = [];

  // Expand search radius from 1 to 5 units until orders are found
  for (let radius = 1; radius <= MAX_RADIUS; radius++) {
    const cells = gridDisk(engineer.h3Index, radius);
    const now = new Date();

    // 1. Fetch Regular (User) Orders
    const regularOrders = await Order.find({
      h3Index: { $in: cells },
      status: "Searching",
      assignedEngineer: null,
      isDeleted: { $ne: true },
      $or: [
        { orderType: "INSTANT" },
        { 
          orderType: "SCHEDULED", 
          scheduledAt: { $lte: now } 
        }
      ]
    })
      .select("orderId location amount totalDuration orderType scheduledAt addressText customerDetails servicePlan servicePlans created_at createdAt")
      .sort({ createdAt: -1 })
      .limit(MAX_ORDERS)
      .lean();

    // 2. Fetch Vendor Orders
    const vendorOrders = await VendorOrder.find({
      h3Index: { $in: cells },
      status: "PENDING",
      assigned_engineer_id: null,
      rejected_engineers: { $ne: engineer._id } // Exclude if this engineer rejected it
    })
      .select("call_id location order_price support_type branch_name complete_address created_at")
      .sort({ created_at: -1 })
      .limit(MAX_ORDERS)
      .lean();

    // 3. Mark types, unify address, and REDACT sensitive customer info for unassigned orders
    const mappedRegular = regularOrders.map(o => ({ 
      ...o, 
      isVendorOrder: false,
      address: o.addressText || "Address available after acceptance",
      // Redact customer details for privacy
      customerDetails: {
        name: "Customer",
        phone: "Hidden"
      }
    }));

    const mappedVendor = vendorOrders.map(o => ({ 
      ...o, 
      isVendorOrder: true,
      address: o.complete_address || "Address available after acceptance",
      // Redact contact info for privacy
      contact_name: "Customer",
      contact_phone: "Hidden"
    }));

    const merged = [...mappedRegular, ...mappedVendor].sort((a, b) => {
      const timeA = new Date(a.createdAt || a.created_at).getTime();
      const timeB = new Date(b.createdAt || b.created_at).getTime();
      return timeB - timeA; // Newest first
    });

    if (merged.length) {
      foundOrders = merged.slice(0, MAX_ORDERS);
      break; 
    }
  }

  return foundOrders;
};
