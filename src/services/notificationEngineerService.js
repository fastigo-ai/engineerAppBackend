import { sendPushToMatchedEngineers } from "./notification/notificationService.js";
import { latLngToCell, gridDisk } from "h3-js";
import { Engineer } from "../models/engineersModal.js";
import { getIO } from "../config/socket.js";
import { getDistanceInMeters } from "../utils/distance.js";

const H3_RESOLUTION  = 8;
const MAX_RADIUS_M   = 25_000;
const MAX_RESULTS    = 15;
const MIN_CANDIDATES = 15;
const RING_START     = 2;
const RING_MAX       = 20;
const RING_STEP      = 2;
const MAX_EXCLUSIONS = 100;

export const notifyMatchedEngineers = async (engineers, orderData) => {
  const io = getIO();
  const orderId = orderData.id || orderData._id;

  console.log(`[Notify] Dispatching order ${orderId} to ${engineers.length} engineers`);

  for (const eng of engineers) {
    const engineerRoom = eng._id.toString(); 

    if (orderData.isVendorOrder) {
      io.to(engineerRoom).emit("NEW_VENDOR_ORDER_REQUEST", {
        order_id:     orderId,
        _id:          orderId,
        call_id:      orderData.call_id    ?? null,
        address:      orderData.address    ?? orderData.addressText,
        branch_name:  orderData.branch_name ?? null,
        state_name:   orderData.state_name  ?? null,
        distance:     eng.distanceKm,
        support_type: orderData.type,
        order_price:  orderData.price,
        timer:        30,
        location:     orderData.location,
      });
    } else {
      io.to(engineerRoom).emit("NEW_USER_ORDER_REQUEST", {
        order_id:      orderId,
        _id:           orderId,
        address:       orderData.addressText ?? orderData.address ?? 'nearby location',
        addressText:   orderData.addressText,
        paymentMode:   orderData.paymentMode,
        servicePlan:   orderData.notes?.servicePlanNames ?? "New Job",
        userDetail:    orderData.customerDetails,
        scheduledAt:   orderData.scheduledAt,
        totalDuration: orderData.totalDuration,
        distance:      eng.distanceKm,
        support_type:  orderData.type,
        order_price:   orderData.amount,
        timer:         30,
        location:      orderData.location,
      });
    }
  }

  const engineerIds = engineers.map(e => e._id);
  const payload = {
    notification: {
      title: 'New Job Request!',
      body:  `New ${orderData.type ?? 'job'} available at ${orderData.address ?? orderData.addressText ?? 'nearby location'}`,
    },
    data: {
      order_id:         String(orderId),
      support_type:     orderData.type                       ?? '',
      complete_address: orderData.address                    ?? orderData.addressText ?? '',
      customer_name:    orderData.customerDetails?.name      ?? '',
      type:             'NEW_ORDER',
    },
  };

  try {
    await sendPushToMatchedEngineers(engineerIds, payload);
    console.log(`[Notify] FCM push queued for ${engineerIds.length} engineers`);
  } catch (err) {
    console.error(`[Notify] FCM batch failed for order ${orderId}:`, err.message);
  }
};

export const notifyEngineersForOrder = async (order) => {
  if (!order.location?.coordinates) {
    console.warn(`[Dispatch] Order ${order._id} missing location — skipping`);
    return { success: false, reason: 'missing_location' };
  }

  const isVendor = !!order.vendor_id;

  const rawExclusions = [
    order.assignedEngineer,
    order.assigned_engineer_id,
    order.acceptedBy,
    ...(order.rejectedBy          ?? []),
    ...(order.rejected_engineers  ?? []),
  ]
    .filter(Boolean)
    .map(String);

  const excludeEngineers = [...new Set(rawExclusions)].slice(0, MAX_EXCLUSIONS);

  let matchedEngineers;
  try {
    matchedEngineers = await matchEngineersByLocation({
      location: order.location,
      excludeEngineers,
    });
  } catch (err) {
    console.error(`[Dispatch] Matching failed for order ${order._id}:`, err.message);
    return { success: false, reason: 'matching_error' };
  }

  if (!matchedEngineers.length) {
    console.warn(`[Dispatch] No engineers found for order ${order._id} (${excludeEngineers.length} excluded)`);
    return { success: true, count: 0 };
  }

  const orderData = isVendor
    ? {
        id:          order._id,
        call_id:     order.call_id,
        address:     order.complete_address,
        branch_name: order.branch_name,
        state_name:  order.state_name,
        type:        order.support_type,
        isVendorOrder: true,
        price:       order.order_price ? `₹${order.order_price}` : 'To Be Decided',
        location:    order.location,
      }
    : (() => {
        const servicePlanNames =
          order.servicePlan?.name ?? order.servicePlans?.[0]?.name ?? 'New Job';
        return {
          id:              order._id,
          call_id:         order.orderId,
          address:         order.bookingDetails?.address ?? 'nearby location',
          type:            servicePlanNames,
          isVendorOrder:   false,
          price:           order.amount ? `₹${order.amount}` : 'To Be Decided',
          location:        order.location,
          scheduledAt:     order.scheduledAt,
          addressText:     order.addressText,
          paymentMode:     order.paymentMode,
          notes:           { ...order.notes, servicePlanNames },
          customerDetails: order.customerDetails,
          totalDuration:   order.totalDuration,
        };
      })();

  await notifyMatchedEngineers(matchedEngineers, orderData);
  console.log(`[Dispatch] Order ${order._id} sent to ${matchedEngineers.length} engineers`);
  return { success: true, count: matchedEngineers.length };
};

export async function matchEngineersByLocation({ location, excludeEngineers = [] }) {
  if (!location?.coordinates || location.coordinates.length !== 2) {
    throw new Error("Invalid location: expected GeoJSON [lng, lat]");
  }

  const [lng, lat]    = location.coordinates;
  const originCell    = latLngToCell(lat, lng, H3_RESOLUTION);
  const excludeSet    = new Set(excludeEngineers.map(String));
  const seenIds       = new Set();
  const matched       = [];
  const searchedCells = new Set();

  for (let k = RING_START; k <= RING_MAX; k += RING_STEP) {
    const allCells = gridDisk(originCell, k);
    const newCells = allCells.filter(c => !searchedCells.has(c));
    allCells.forEach(c => searchedCells.add(c));

    if (newCells.length === 0) continue;

    const engineers = await Engineer.find({
      h3Index:     { $in: newCells },
      isActive:    true,
      isAvailable: true,
      isDeleted:   false,
      isBlocked:   false,
      isSuspended: false,
      lastHeartbeat: { $gte: new Date(Date.now() - 5 * 60 * 1000) }, // Active within last 5 mins
      ...(excludeSet.size > 0 && { _id: { $nin: [...excludeSet] } }),
    })
      .select("_id name mobile rating fcmTokens location h3Index")
      .lean();

    for (const e of engineers) {
      const id = e._id.toString();
      if (seenIds.has(id) || !e.location?.coordinates) continue;

      const [eLng, eLat]     = e.location.coordinates;
      const distanceInMeters = getDistanceInMeters(lat, lng, eLat, eLng);

      if (distanceInMeters <= MAX_RADIUS_M) {
        seenIds.add(id);
        matched.push({
          _id:             e._id,
          name:            e.name,
          mobile:          e.mobile,
          rating:          e.rating,
          fcmTokens:       e.fcmTokens,
          h3Index:         e.h3Index,
          distanceInMeters,
          distanceKm:      +(distanceInMeters / 1000).toFixed(2),
        });
      }
    }

    if (matched.length >= MIN_CANDIDATES) {
      console.log(`[Matching] ${matched.length} candidates found at k=${k} near [${lat.toFixed(4)}, ${lng.toFixed(4)}]`);
      break;
    }
  }

  if (matched.length === 0) {
    console.warn(`[Matching] No engineers within ${MAX_RADIUS_M / 1000}km of [${lat.toFixed(4)}, ${lng.toFixed(4)}]`);
  }

  return matched
    .sort((a, b) => a.distanceInMeters - b.distanceInMeters)
    .slice(0, MAX_RESULTS);
}
