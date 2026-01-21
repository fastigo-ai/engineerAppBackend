import { latLngToCell, gridDisk } from "h3-js";
import { Engineer } from "../models/engineersModal.js";
import { getDistanceInMeters } from "../utils/distance.js";
import { getIO } from "../config/socket.js";
import VendorOrder from "../models/vendorOrderModal.js";

/* 🔔 SOCKET EMITTER */

const notifyEngineers = async (engineers, order) => {
  const io = getIO();
  const orderRoom = `order_${order._id}`;

  console.log(`Notifying ${engineers.length} engineers for Order ${order._id}`);

  for (const eng of engineers) {
    const engineerRoom = eng.engineer_id.toString();

    // Send order request
    io.to(engineerRoom).emit("NEW_ORDER_REQUEST", {
      order_id: order._id,
      call_id: order.call_id,
      address: order.complete_address,
      distance: eng.distanceKm,
      support_type: order.support_type,
      timer: 30
    });

    // Join ONLY online sockets
    const sockets = await io.in(engineerRoom).fetchSockets();
    if (sockets.length > 0) {
      io.in(engineerRoom).socketsJoin(orderRoom);
      console.log(`Engineer ${engineerRoom} joined ${orderRoom}`);
    }
  }
};

/* 🛠️ ENGINEER MATCHING LOGIC */

const H3_RESOLUTION = 8;
const MAX_RADIUS_KM = 25;
const RING_SIZE = 30; // Optimized for 25km at Res 8
const MAX_RESULTS = 10;

export async function matchEngineers({ location }) {
  if (!location?.coordinates || location.coordinates.length !== 2) {
    throw new Error("Invalid order location format");
  }

  // MongoDB: [lng, lat]
  const [orderLng, orderLat] = location.coordinates;
  const orderCell = latLngToCell(orderLat, orderLng, H3_RESOLUTION);
  const searchCells = gridDisk(orderCell, RING_SIZE);



  /* =====================================================
      1️⃣ FETCH DATA (Removing strict filters for debugging)
  ===================================================== */
const engineers = await Engineer.find({
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
  .select("_id name mobile location rating totalJobs completedJobs h3Index isAvailable isActive")
  .lean();


  if (!engineers.length) {
    console.log("❌ No engineers matched the H3 grid or database filters.");
    return [];
  }

  /* =====================================================
      2️⃣ PRECISE DISTANCE FILTER
  ===================================================== */
  const matched = engineers
    .filter(e => e.location?.coordinates?.length === 2)
    .map(e => {
      const [eLng, eLat] = e.location.coordinates;
      const distance = getDistanceInMeters(orderLat, orderLng, eLat, eLng);

      console.log(`Checking Eng: ${e.name} | Dist: ${(distance / 1000).toFixed(2)}km | H3: ${e.h3Index}`);

      return {
        engineer_id: e._id,
        name: e.name,
        mobile: e.mobile,
        rating: e.rating,
        h3Index: e.h3Index,
        distanceInMeters: distance,
        distanceKm: +(distance / 1000).toFixed(2)
      };
    })
    .filter(e => e.distanceInMeters <= MAX_RADIUS_KM * 1000)
    .sort((a, b) => a.distanceInMeters - b.distanceInMeters)
    .slice(0, MAX_RESULTS);

  return matched;
}



export const createAndMatchVendorOrder = async (payload) => {
  const {
    vendor_id,
    call_id,
    location
  } = payload;

  /* 1️⃣ ATOMIC UPSERT (IDEMPOTENT) */
  const order = await VendorOrder.findOneAndUpdate(
    { vendor_id, call_id },
    {
      $setOnInsert: {
        vendor_id,
        project_id: payload.project_id,
        call_id,

        state_name: payload.state,
        branch_name: payload.branch_name,
        branch_code: payload.branch_code,

        complete_address: payload.address,
        pincode: payload.pincode,

        assets_count: payload.asset_count || 1,
        support_type: payload.support_type,
        asset_type: payload.asset_type,

        l1_support_name: payload.l1_support_name,
        l1_support_number: payload.l1_support_number,

        location,
        status: "PENDING"
      }
    },
    { upsert: true, new: true }
  );

  /* 2️⃣ MATCH ENGINEERS */
  const matchedEngineers = await matchEngineers({
    location: order.location
  });

  if (!matchedEngineers.length) {
    await VendorOrder.findByIdAndUpdate(order._id, {
      status: "EXPIRED",
      failure_reason: "NO_ENGINEERS_AVAILABLE"
    });

    return {
      success: false,
      order,
      matchedEngineers: []
    };
  }
  await VendorOrder.findByIdAndUpdate(order._id, {
    notified_engineers: matchedEngineers.map(e => e.engineer_id)
  });

  /* 3️⃣ SOCKET NOTIFY (ASYNC, NON BLOCKING) */
  notifyEngineers(matchedEngineers, order);

  return {
    success: true,
    order,
    matchedEngineers
  };
};



export const acceptOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    const engineerId = req.user.id;

    const order = await VendorOrder.findOneAndUpdate(
      {
        _id: orderId,
        status: { $in: ["PENDING", "MATCHING"] }
      },
      {
        $set: {
          status: "ACCEPTED",
          assigned_engineer_id: engineerId,
          accepted_at: new Date()
        }
      },
      { new: true }
    );

    if (!order) {
      return res.status(400).json({
        success: false,
        message: "Order already taken or expired"
      });
    }

    const io = getIO();
    const orderRoom = `order_${order._id}`;

    // ✅ Confirm winner ONLY
    io.to(engineerId.toString()).emit("ORDER_CONFIRMED", {
      order_id: order._id
    });

    // ✅ Close popup ONLY for engineers who saw this order
    io.to(orderRoom).emit("ORDER_CLOSED", {
      order_id: order._id
    });

    io.in(orderRoom).socketsLeave(orderRoom);
    console.log(`All engineers left ${orderRoom}`);

    return res.status(200).json({
      success: true,
      order
    });

  } catch (err) {
    console.error("Accept Order Error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export const rejectOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    const engineerId = req.user.id;

    const io = getIO();
    const orderRoom = `order_${orderId}`;
    const engineerRoom = engineerId.toString();

    /* 1️⃣ Remove engineer socket from order room */
    io.in(engineerRoom).socketsLeave(orderRoom);

    /* 2️⃣ Persist rejection (VERY IMPORTANT) */
    await VendorOrder.findByIdAndUpdate(orderId, {
      $addToSet: {
        rejected_engineers: engineerId
      }
    });

    console.log(`🚫 Engineer ${engineerId} rejected Order ${orderId}`);

    return res.status(200).json({
      success: true,
      message: "Order rejected successfully"
    });

  } catch (err) {
    console.error("Reject Order Error:", err);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export const completeOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    const engineerId = req.user.id;

    const order = await VendorOrder.findOneAndUpdate(
      { 
        _id: orderId, 
        assigned_engineer_id: engineerId, 
        status: "ACCEPTED" 
      },
      { 
        $set: { 
          status: "COMPLETED", 
          completed_at: new Date() 
        } 
      },
      { new: true }
    );

    if (!order) {
      return res.status(400).json({ 
        success: false, 
        message: "Order not found or not assigned to you." 
      });
    }

    // 🚀 CRITICAL: Make the engineer available again
    await Engineer.findByIdAndUpdate(engineerId, { isAvailable: true });

    return res.status(200).json({
      success: true,
      message: "Order completed successfully. You are now online for new orders.",
      order
    });
  } catch (err) {
    console.error("Complete Order Error:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};



