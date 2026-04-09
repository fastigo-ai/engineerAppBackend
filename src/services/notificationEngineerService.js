import { sendPushToMatchedEngineers } from "./notification/notificationService.js";
import { latLngToCell, gridDisk } from "h3-js";
import { Engineer } from "../models/engineersModal.js";
import { getIO } from "../config/socket.js";
import { getDistanceInMeters } from "../utils/distance.js";

const H3_RESOLUTION = 8;
const MAX_RADIUS_KM = 25;
const RING_SIZE = 30;
const MAX_RESULTS = 10;

/**
 * Notifies matched engineers about a new order via Socket.io and Push Notifications (FCM).
 * @param {Array} engineers - List of matched engineers with distance info.
 * @param {Object} orderData - Order details for the notification.
 */
export const notifyMatchedEngineers = async (engineers, orderData) => {
  const io = getIO();
  const orderRoom = `order_${orderData.id}`;

  console.log(`Notifying ${engineers.length} engineers for Order ${orderData.id}`);

  // 1. Send order request via Socket.io to each engineer
  for (const eng of engineers) {
    const engineerRoom = eng._id.toString() || eng.engineer_id.toString();

    if (orderData.type !== "User Order") {
      io.to(engineerRoom).emit("NEW_VENDOR_ORDER_REQUEST", {
        order_id: orderData._id,
        call_id: orderData.call_id || null,
        address: orderData.address || orderData.addressText,
        branch_name: orderData.branch_name || null,
        state_name: orderData.state_name || null,
        distance: eng.distanceKm,
        support_type: orderData.type,
        order_price: orderData.price,
        timer: 30,
        location: orderData.location
      });
    } else {
      io.to(engineerRoom).emit("NEW_USER_ORDER_REQUEST", {
        order_id: orderData._id,
        address: orderData.addressText || orderData.address || 'nearby location',
        addressText: orderData.addressText,
        paymentMode: orderData.paymentMode,
        servicePlan: orderData.notes?.servicePlanNames || "New Job",
        userDetail: orderData.customerDetails,
        scheduledAt: orderData.scheduledAt,
        totalDuration: orderData.totalDuration,
        distance: eng.distanceKm,
        support_type: orderData.type,
        order_price: orderData.amount,
        timer: 30,
        location: orderData.location
      });
    }

    // Join online sockets to the order room
    const sockets = await io.in(engineerRoom).fetchSockets();
    if (sockets.length > 0) {
      io.in(engineerRoom).socketsJoin(orderRoom);
    }
  }

  // 2. Batch send push notifications via Centralized Notification Service
  const engineerIds = engineers.map(e => e._id);
  const payload = {
    notification: {
      title: 'New Job Request!',
      body: `New ${orderData.type || 'job'} available at ${orderData.address || 'nearby location'}`,
    },
    data: {
      order_id: (orderData._id || orderData.id).toString(),
      support_type: orderData.type || '',
      complete_address: orderData.address || orderData.addressText || '',
      customer_name: orderData.customerDetails?.name || '',
      type: 'NEW_ORDER'
    }
  };

  sendPushToMatchedEngineers(engineerIds, payload);
};


/**
 * Centralized helper to notify engineers for any order (Regular or Vendor).
 * This replaces local helpers in various controllers.
 * @param {Object} order - The populated Order or VendorOrder document.
 */
export const notifyEngineersForOrder = async (order) => {
  try {
    if (!order.location || !order.location.coordinates) {
      console.warn(`Cannot notify for order ${order._id}: Missing location.`);
      return;
    }

    // Determine if it's a Vendor order or Regular (User) order
    const isVendor = !!order.vendor_id;
    
    // Prepare exclusion list (assigned + rejected)
    const excludeEngineers = [];
    if (order.assignedEngineer) excludeEngineers.push(order.assignedEngineer.toString());
    if (order.assigned_engineer_id) excludeEngineers.push(order.assigned_engineer_id.toString());
    if (order.acceptedBy) excludeEngineers.push(order.acceptedBy.toString());
    
    if (order.rejectedBy && Array.isArray(order.rejectedBy)) {
      order.rejectedBy.forEach(id => excludeEngineers.push(id.toString()));
    }
    if (order.rejected_engineers && Array.isArray(order.rejected_engineers)) {
      order.rejected_engineers.forEach(id => excludeEngineers.push(id.toString()));
    }

    // Match nearby available engineers (excluding those already aware/assigned)
    const matchedEngineers = await matchEngineersByLocation({
      location: order.location,
      excludeEngineers: [...new Set(excludeEngineers)] // Unique IDs
    });

    if (matchedEngineers && matchedEngineers.length > 0) {
      let orderData;

      if (isVendor) {
        orderData = {
          id: order._id,
          call_id: order.call_id,
          address: order.complete_address,
          branch_name: order.branch_name,
          state_name: order.state_name,
          type: order.support_type,
          price: order.order_price ? `₹${order.order_price}` : "To Be Decided",
          location: order.location
        };
      } else {
        // Regular user order
        // Ensure service plans are populated for names
        if (!order.servicePlan && !order.servicePlans?.length && order.populate) {
          await order.populate('servicePlan servicePlans');
        }

        const servicePlanNames = order.servicePlan?.name || (order.servicePlans?.[0]?.name) || 'New Job';

        orderData = {
          id: order._id,
          call_id: order.orderId,
          address: order.bookingDetails?.address || 'nearby location',
          type: servicePlanNames,
          price: order.amount ? `₹${order.amount}` : "To Be Decided",
          location: order.location,
          scheduledAt: order.scheduledAt,
          addressText: order.addressText,
          paymentMode: order.paymentMode,
          notes: { ...order.notes, servicePlanNames },
          customerDetails: order.customerDetails,
          totalDuration: order.totalDuration
        };
      }

      await notifyMatchedEngineers(matchedEngineers, orderData);
      console.log(`✅ Successfully broadcasted ${isVendor ? 'Vendor' : 'User'} order ${order._id} to ${matchedEngineers.length} engineers.`);
    } else {
      console.log(`ℹ️ No matching engineers found for order ${order._id} (Exclusions applied: ${excludeEngineers.length})`);
    }
  } catch (error) {
    console.error(`❌ Error in centralized notifyEngineersForOrder for order ${order._id}:`, error);
  }
};

/**
 * Matches engineers based on location using H3 grid.
 * @param {Object} location - GeoJSON location {type, coordinates: [lng, lat]}
 * @param {Array} excludeEngineers - List of engineer IDs to skip.
 */
export async function matchEngineersByLocation({ location, excludeEngineers = [] }) {
  if (!location?.coordinates || location.coordinates.length !== 2) {
    throw new Error("Invalid location format");
  }

  const [lng, lat] = location.coordinates;
  const h3Cell = latLngToCell(lat, lng, H3_RESOLUTION);
  const searchCells = gridDisk(h3Cell, RING_SIZE);

  // Find active and available engineers in the H3 grid
  const engineers = await Engineer.find({
    _id: { $nin: excludeEngineers }, // EXCLUSION LOGIC
    location: { $exists: true },
    isActive: true,
    isAvailable: true,
    isDeleted: false,
    isBlocked: false,
    isSuspended: false,
    $or: [
      { h3Index: { $in: searchCells } },
      { h3Index: { $exists: false } },
      { h3Index: null }
    ]
  })
    .select("_id name mobile location rating totalJobs completedJobs h3Index isAvailable isActive fcmTokens")
    .lean();

  if (!engineers.length) {
    return [];
  }

  // Refine matching based on precise distance
  const matched = engineers
    .filter(e => e.location?.coordinates?.length === 2)
    .map(e => {
      const [eLng, eLat] = e.location.coordinates;
      const distance = getDistanceInMeters(lat, lng, eLat, eLng);

      return {
        _id: e._id,
        name: e.name,
        mobile: e.mobile,
        rating: e.rating,
        h3Index: e.h3Index,
        fcmTokens: e.fcmTokens,
        distanceInMeters: distance,
        distanceKm: +(distance / 1000).toFixed(2)
      };
    })
    .filter(e => e.distanceInMeters <= MAX_RADIUS_KM * 1000)
    .sort((a, b) => a.distanceInMeters - b.distanceInMeters)
    .slice(0, MAX_RESULTS);

  return matched;
}
