import { Order } from "../models/orderSchema.js";
import VendorOrder from '../modules/vendorOrder/core/vendorOrder.model.js';
import { gridDisk } from "h3-js";
import { getDistanceInMeters } from "../utils/distance.js";

const USER_RADIUS_RINGS = 12; // ~10km
const VENDOR_RADIUS_RINGS = 30; // ~25km
const MAX_ORDERS = 15; // increased for mixed orders

export const getNearbyOrdersService = async ({ engineer, type = "all", page = 1, limit = 15 }) => {
  if (!engineer.h3Index) {
    throw new Error("Engineer location not available");
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const parsedLimit = parseInt(limit);

  // Extract engineer coordinates for distance calculation
  const engCoords = engineer.location?.coordinates;
  const engLat = engCoords ? engCoords[1] : null;
  const engLon = engCoords ? engCoords[0] : null;

  // Aggregate all orders within separate radii
  const allRegularOrders = [];
  const allVendorOrders = [];

  // 1. Fetch Regular (User) Orders (within 10km / 12 rings)
  if (type === "all" || type === "user") {
    const userCells = gridDisk(engineer.h3Index, USER_RADIUS_RINGS);
    const regularOrders = await Order.find({
      h3Index: { $in: userCells },
      status: { $in: ["Searching", "created", "paid", "pending"] },
      assignedEngineer: null,
      isDeleted: { $ne: true },
      rejectedBy: { $ne: engineer._id },
      work_status: { $nin: ["Completed", "Cancelled", "ExpertUnavailable"] },
      $or: [
        { orderType: "INSTANT" },
        { 
          orderType: "SCHEDULED", 
          scheduledAt: { $gte: new Date() } 
        }
      ]
    })
      .select("orderId location amount totalDuration orderType scheduledAt addressText customerDetails servicePlan servicePlans created_at createdAt notes bookingDetails paymentMode paymentStatus")
      .sort({ createdAt: -1 })
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
      .select("call_id location order_price support_type branch_name complete_address created_at payment_status payout_amount description sop l1_support_name l1_support_number")
      .sort({ created_at: -1 })
      .lean();
    
    allVendorOrders.push(...vendorOrders);
  }

  console.log(` Nearby Search: Found ${allRegularOrders.length} user orders, ${allVendorOrders.length} vendor orders`);

  // 3. Mark types, unify address, and STRICTLY REDACT sensitive info
  const mappedRegular = allRegularOrders.map(o => {
    let distance = "TBD";
    const ordLoc = o.location;
    if (engLat && engLon && ordLoc) {
        const lat2 = ordLoc.coordinates ? ordLoc.coordinates[1] : ordLoc.lat;
        const lon2 = ordLoc.coordinates ? ordLoc.coordinates[0] : ordLoc.lng;
        if (lat2 !== undefined && lon2 !== undefined) {
            const d = getDistanceInMeters(engLat, engLon, lat2, lon2);
            distance = (d / 1000).toFixed(2);
        }
    }
    const { addressText, location, customerDetails, ...safeOrder } = o;
    return { 
      ...safeOrder, 
      isVendorOrder: false,
      distance,
      address: "Hidden until acceptance",
      customerName: "Customer",
      customerPhone: "Hidden",
      bookingDetails: o.bookingDetails ? {
        services: o.bookingDetails.services,
        category: o.bookingDetails.category,
        description: o.bookingDetails.description
      } : undefined,
      notes: o.notes
    };
  });

  const mappedVendor = allVendorOrders.map(o => {
    let distance = "TBD";
    const ordLoc = o.location;
    if (engLat && engLon && ordLoc) {
        const lat2 = ordLoc.coordinates ? ordLoc.coordinates[1] : ordLoc.lat;
        const lon2 = ordLoc.coordinates ? ordLoc.coordinates[0] : ordLoc.lng;
        if (lat2 !== undefined && lon2 !== undefined) {
            const d = getDistanceInMeters(engLat, engLon, lat2, lon2);
            distance = (d / 1000).toFixed(2);
        }
    }
    const { complete_address, location, contact_phone, contact_name, ...safeOrder } = o;
    return { 
      ...safeOrder, 
      isVendorOrder: true,
      distance,
      address: "Hidden until acceptance",
      customerName: "Customer",
      customerPhone: "Hidden"
    };
  });

  const merged = [...mappedRegular, ...mappedVendor].sort((a, b) => {
    const timeA = new Date(a.createdAt || a.created_at).getTime();
    const timeB = new Date(b.createdAt || b.created_at).getTime();
    return timeB - timeA;
  });

  const totalCount = merged.length;
  const paginatedResults = merged.slice(skip, skip + parsedLimit);

  return {
    orders: paginatedResults,
    totalCount,
    currentPage: parseInt(page),
    totalPages: Math.ceil(totalCount / parsedLimit),
    hasMore: skip + parsedLimit < totalCount
  };
};
