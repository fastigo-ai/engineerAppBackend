import axios from "axios";
import { latLngToCell, gridDisk, gridDiskDistances } from "h3-js";
import VendorOrder from './vendorOrder.model.js';
import { Engineer } from "../modules/auth/engineer/engineer.model.js";
import { notifyEngineersForOrder, matchEngineersByLocation } from "./notificationEngineerService.js";
import { getDistanceInMeters } from "../utils/distance.js";

const H3_RESOLUTION = 8;

// notifyEngineersForOrder centralized service handles both Regular and Vendor orders



export const createAndMatchVendorOrder = async (payload) => {
  const {
    vendor_id,
    call_id,
    location
  } = payload;



  /* 1️⃣ ATOMIC UPSERT (IDEMPOTENT) */

  const [orderLng, orderLat] = location.coordinates;
  const orderCell = latLngToCell(orderLat, orderLng, H3_RESOLUTION);

  console.log('Creating order with H3 index:', orderCell);


  const order = await VendorOrder.findOneAndUpdate(
    { vendor_id, call_id },
    {
      $setOnInsert: {
        vendor_id,
        projectId: payload.projectId || payload.project_id,
        call_id,

        state_name: payload.state || "N/A",
        branch_name: payload.branch_name || "N/A",
        branch_code: payload.branch_code,

        complete_address: payload.address || payload.complete_address || "Address not provided",
        pincode: payload.pincode,

        assets_count: payload.asset_count || 1,
        support_type: payload.support_type,
        asset_type: payload.asset_type,

        l1_support_name: payload.l1_support_name,
        l1_support_number: payload.l1_support_number,

        contact_name: payload.contact_name,
        contact_phone: payload.contact_phone,

        order_price: payload.amount || 0,
        sla_priority: payload.sla_priority,
        sla_response_time_minutes: payload.sla_response_time_minutes || 0,
        description: payload.description,

        location,
        status: "PENDING",
        h3Index: orderCell
      }
    },
    { upsert: true, new: true, runValidators: true }
  );

  /* 2️⃣ NOTIFY ENGINEERS (CENTRALIZED) */
  // notifyEngineersForOrder handles matching, socket emissions, and push notifications
  const notifyResult = await notifyEngineersForOrder(order);

  if (!notifyResult.success || notifyResult.count === 0) {
    console.log(`[VendorRequest] No engineers found immediately for ${order._id}. Order remains PENDING.`);
    return {
      success: false,
      order,
      matchedEngineers: []
    };
  }

  // Update notified list in DB for tracking
  // We can't easily get the list back from notifyEngineersForOrder without changing its return type,
  // but for now we prioritize reliability over this tracking field.
  // If needed, we can re-add matching here, but it's redundant.

  return {
    success: true,
    order,
    matchedEngineers: notifyResult.matchedEngineers || []
  };
};

export const acceptOrderService = async ({ orderId, engineerId, distance }) => {
  // 1. Fetch Engineer
  const engineer = await Engineer.findById(engineerId).lean();
  if (!engineer) {
    throw { status: 404, message: "Engineer not found" };
  }

  const existingOrder = await VendorOrder.findById(orderId).lean();
  if (existingOrder && existingOrder.status === 'ON_HOLD') {
    throw { status: 403, message: "Order is on hold and cannot be accepted at this time" };
  }

  // 2. Atomic Update (Locking the order)
  const order = await VendorOrder.findOneAndUpdate(
    {
      _id: orderId,
      status: { $in: ["PENDING", "MATCHING"] },
      work_status: { $nin: ["COMPLETED", "DONE"] }
    },
    {
      $set: {
        status: "ACCEPTED",
        assigned_engineer_id: engineerId,
        accepted_at: new Date(),
        payment_status: "PENDING",
        work_status: "IN_PROGRESS"
      }
    },
    { new: true }
  );

  if (!order) {
    throw { status: 409, message: "Order already taken or not assigned to you" };
  }

  // 3. Wait for Vendor Backend (Synchronous per your requirement)
  const payload = {
    call_id: order.call_id,
    status: "ACCEPTED",
    engineer_id: engineer.engineerId,
    engineer_name: engineer.name,
    engineer_contact: engineer.mobile,
    distance,
    accepted_at: order.accepted_at
  };

  console.log("Notifying Vendor of acceptance with payload:", payload);

  await axios.post(
    "https://door2fyvendor-gv4g4.ondigitalocean.app/calls/engineer/assignment-result",
    payload,
  );


  return order;
};


export const rejectOrderService = async ({ orderId, engineerId }) => {
  // 1. Fetch Engineer details first (needed for the payload)
  const engineer = await Engineer.findById(engineerId).lean();
  if (!engineer) {
    throw { status: 404, message: "Engineer not found" };
  }

  // 2. Persist the rejection in our DB
  const updateData = {
    $addToSet: { rejected_engineers: engineerId }
  };

  // If the rejecting engineer is the one who was assigned, reset the assignment
  const currentOrder = await VendorOrder.findById(orderId);

  // --- BLOCK DECLINE IF COMPLETED ---
  if (currentOrder && (currentOrder.status === 'COMPLETED' || currentOrder.work_status === 'COMPLETED' || currentOrder.work_status === 'DONE')) {
    throw { status: 400, message: "Cannot decline a completed job" };
  }

  let shouldReDispatch = false;

  if (currentOrder && currentOrder.assigned_engineer_id && currentOrder.assigned_engineer_id.toString() === engineerId.toString()) {
    updateData.$set = {
      assigned_engineer_id: null,
      status: "PENDING",
      work_status: "NOT_STARTED",
      accepted_at: null
    };
    shouldReDispatch = true;
    console.log('✅ Vendor order un-assigned and reset to PENDING for re-dispatch');
  }

  const order = await VendorOrder.findOneAndUpdate(
    { _id: orderId },
    updateData,
    { new: true }
  );

  if (!order) {
    throw { status: 404, message: "Order not found" };
  }

  // 3. Trigger re-dispatch if applicable
  if (shouldReDispatch) {
    await notifyEngineersForOrder(order);
  }

  // 3. Construct the payload for the Vendor
  // const payload = {
  //   call_id: order.call_id,
  //   status: "REJECTED",
  //   engineer_id: engineerId,
  //   engineer_name: engineer.name,
  //   engineer_contact: engineer.mobile || engineer.phone,
  //   rejected_at: new Date()
  // };

  // 4. Notify Vendor Backend
  // We wrap this in a try-catch or use Promise.allSettled so 
  // a vendor API failure doesn't crash your local rejection logic.
  // try {
  //   await axios.post(
  //     "https://door2fyvendor-gv4g4.ondigitalocean.app/calls/engineer/assignment-result",
  //     payload
  //   );
  // } catch (axiosError) {
  //   console.warn("Vendor notification failed during rejection, but order was updated locally.");
  // }

  return order;
};
/**
 * Bulk Serviceability Check using H3 indexing and local distance verification.
 * Optimized for high performance and minimal DB load.
 */
// export const checkServiceability = async ({ projectId, calls }) => {
//   const H3_RESOLUTION = 8;
//   const RING_SIZE = 22;
//   const SERVICE_RADIUS_METERS = 20000;
//   const SAFE_RING_LIMIT = 18; // Rings <= 18 are guaranteed within 20km

//   const callMap = new Map();         
//   const allRequiredCells = new Set();
//   const serviceable = [];
//   const non_serviceable = [];

//   // 1. Prepare H3 Search Areas
//   for (const call of calls) {
//     const { call_id, lat, lng } = call;

//     if (call_id == null) {
//       non_serviceable.push({ call_id: null, reason: "Missing call_id" });
//       continue;
//     }

//     if (typeof lat !== "number" || typeof lng !== "number" ||
//       isNaN(lat) || isNaN(lng) ||
//       lat < -90 || lat > 90 || lng < -180 || lng > 180) {
//       non_serviceable.push({ call_id, reason: "Invalid coordinates" });
//       continue;
//     }

//     try {
//       const centerCell = latLngToCell(lat, lng, H3_RESOLUTION);
//       // Use gridDiskDistances to separate safe inner rings from edge rings
//       const cellsWithDistances = gridDiskDistances(centerCell, RING_SIZE);
      
//       const safeCells = [];
//       const edgeCells = [];

//       for (const [cell, distance] of cellsWithDistances) {
//         if (distance <= SAFE_RING_LIMIT) {
//           safeCells.push(cell);
//         } else {
//           edgeCells.push(cell);
//         }
//         allRequiredCells.add(cell);
//       }

//       callMap.set(call_id, { lat, lng, safeCells, edgeCells });
//     } catch (err) {
//       console.error(`H3 error for call_id=${call_id}:`, err.message);
//       non_serviceable.push({ call_id, reason: "H3 processing error" });
//     }
//   }

//   if (callMap.size === 0) {
//     return { serviceable, non_serviceable };
//   }

//   // 2. Single DB Query for all potential engineers
//   const availableEngineers = await Engineer.find({
//     isActive: true,
//     isAvailable: true,
//     isDeleted: false,
//     isBlocked: false,
//     isSuspended: false,
//     h3Index: { $in: Array.from(allRequiredCells) },
//   }).select("h3Index location").lean();

//   // 3. Index Engineers by H3 Cell and track occupied cells
//   const cellToEngineers = new Map();
//   const occupiedCells = new Set();

//   for (const eng of availableEngineers) {
//     if (!eng.h3Index || !eng.location?.coordinates?.length) continue;
    
//     occupiedCells.add(eng.h3Index);
    
//     if (!cellToEngineers.has(eng.h3Index)) {
//       cellToEngineers.set(eng.h3Index, []);
//     }
//     cellToEngineers.get(eng.h3Index).push(eng);
//   }

//   // 4. Optimized Final Check
//   for (const [call_id, { lat, lng, safeCells, edgeCells }] of callMap) {
//     let found = false;

//     // STEP 4A: Check Safe Inner Rings (Instant O(1) lookup)
//     for (const cell of safeCells) {
//       if (occupiedCells.has(cell)) {
//         found = true;
//         break;
//       }
//     }

//     // STEP 4B: Only if not found in inner rings, check Edge Rings with Distance Math
//     if (!found) {
//       outer: for (const cell of edgeCells) {
//         const engineersInCell = cellToEngineers.get(cell);
//         if (!engineersInCell) continue;

//         for (const eng of engineersInCell) {
//           const [engLng, engLat] = eng.location.coordinates;
//           if (getDistanceInMeters(lat, lng, engLat, engLng) <= SERVICE_RADIUS_METERS) {
//             found = true;
//             break outer;
//           }
//         }
//       }
//     }

//     if (found) {
//       serviceable.push({ call_id });
//     } else {
//       non_serviceable.push({ call_id });
//     }
//   }

//   return { serviceable, non_serviceable };
// };

export const checkServiceability = async ({ calls }) => {

  const SERVICE_RADIUS_METERS = 25000;

  const serviceable = [];
  const non_serviceable = [];

  const validCalls = [];

  // 1. Validate Calls
  for (const call of calls) {

    const { call_id, lat, lng } = call;

    if (call_id == null) {
      non_serviceable.push({
        call_id: null,
        reason: "Missing call_id"
      });
      continue;
    }

    if (
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      isNaN(lat) ||
      isNaN(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      non_serviceable.push({
        call_id,
        reason: "Invalid coordinates"
      });
      continue;
    }

    validCalls.push(call);
  }

  // 2. Check Serviceability
  await Promise.all(

    validCalls.map(async (call) => {

      const { call_id, lat, lng } = call;

      const engineer = await Engineer.findOne({

        isActive: true,
        isAvailable: true,
        isDeleted: false,
        isBlocked: false,
        isSuspended: false,

        location: {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: [lng, lat]
            },
            $maxDistance: SERVICE_RADIUS_METERS
          }
        }

      }).select("_id").lean();

      if (engineer) {

        serviceable.push({
          call_id
        });

      } else {

        non_serviceable.push({
          call_id
        });
      }
    })
  );

  return {
    serviceable,
    non_serviceable
  };
};
