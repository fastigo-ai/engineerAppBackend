import mongoose from "mongoose";
import { Engineer } from "../../auth/engineer/engineer.model.js";
import VendorOrder from '../core/vendorOrder.model.js';
import {
  checkServiceability,
  createAndMatchVendorOrder,
  acceptOrderService,
  rejectOrderService
} from '../core/vendorOrder.service.js';
import { getDistanceInMeters } from "../../../utils/distance.js";
import { latLngToCell, gridDisk } from "h3-js";
import { getIO } from "../../../config/socket.js";
import axios from 'axios';

const H3_RESOLUTION = 8;
const SEARCH_RING_SIZE = 30;

export const servicableLocation = async (req, res) => {
  try {
    const { projectId, calls } = req.body;

    if (!Array.isArray(calls) || calls.length === 0) {
      return res.status(400).json({
        success: false,
        message: "calls must be a non-empty array.",
      });
    }

    const { serviceable, non_serviceable } = await checkServiceability({ projectId, calls });

    return res.status(200).json({
      success: true,
      projectId,
      meta: {
        total_calls: calls.length,
        serviceable_count: serviceable.length,
        non_serviceable_count: non_serviceable.length,
      },
      serviceable,
      non_serviceable,
    });

  } catch (err) {
    console.error("Bulk Serviceability Controller Error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const createVendorRequests = async (req, res) => {
  try {
    const { vendor_id, call_id, location } = req.body;

    console.log("All Order Is", req.body);

    if (!vendor_id || !call_id) {
      return res.status(400).json({
        success: false,
        message: "vendor_id and call_id are required"
      });
    }

    if (
      !location ||
      !Array.isArray(location.coordinates) ||
      location.coordinates.length !== 2
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid location format"
      });
    }

    const result = await createAndMatchVendorOrder(req.body);

    if (!result.success) {
      return res.status(200).json({
        success: false,
        message: "No engineers available",
        orderId: result.order._id
      });
    }

    return res.status(200).json({
      success: true,
      matchType: "H3_GEO_MATCH",
      orderId: result.order._id,
      results: {
        totalFound: result.matchedEngineers.length
      },
      matchedEngineers: result.matchedEngineers
    });

  } catch (err) {
    console.error("Match Error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

export const acceptVendorOrder = async (req, res) => {
  try {
    const { orderId, distance } = req.body;
    const engineerId = req.user.id;

    console.log('=== ACCEPT VENDOR ORDER ===');
    console.log('Order ID:', orderId);
    console.log('Engineer ID:', engineerId);
    console.log('Distance:', distance);

    if (!orderId) {
      console.log('❌ Missing orderId in request body');
      return res.status(400).json({
        success: false,
        message: "OrderId is required"
      });
    }

    // Call the service
    const order = await acceptOrderService({
      orderId,
      engineerId,
      distance
    });


    // 🔔 SOCKET (Handle after successful service execution)
    const io = getIO();
    const orderRoom = `order_${order._id}`;

    // Notify winner
    io.to(engineerId.toString()).emit("ORDER_CONFIRMED", {
      order_id: order._id
    });

    // Close for everyone else
    io.to(orderRoom).emit("ORDER_CLOSED", {
      order_id: order._id
    });

    return res.status(200).json({
      success: true,
      order
    });

  } catch (err) {
    console.error("Accept Order Controller Error:", err);

    // Send specific status code if thrown by service, else default to 500
    const statusCode = err.status || 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Internal server error"
    });
  }
};

export const rejectVendorOrder = async (req, res) => {
  try {
    const orderId = req.body.orderId || req.body.id || req.params.id || req.params.orderId;
    if (!orderId) {
      return res.status(400).json({ success: false, message: "Order ID is required" });
    }
    const engineerId = req.user.id;

    // 1. Call the service to update the Database
    const order = await rejectOrderService({ orderId, engineerId });

    // 2. SOCKET: Remove this engineer from the order room 
    const io = getIO();
    const engineerRoom = engineerId.toString();
    const orderRoom = `order_${orderId}`;

    io.in(engineerRoom).socketsLeave(orderRoom);

    return res.status(200).json({
      success: true,
      message: "Order rejected and removed from your feed"
    });

  } catch (err) {
    console.error("Reject Order Controller Error:", err);
    const statusCode = err.status || 500;
    return res.status(statusCode).json({
      success: false,
      message: err.message || "Internal server error"
    });
  }
};

export const getNearbyVendorOrders = async (req, res) => {
  try {
    const engineerId = req.user.id;
    const { latitude, longitude } = req.query;

    /* ── CONFIGURATION ── */
    const NEARBY_RESOLUTION = 8;
    const NEARBY_RING_SIZE = 12;        // ~10 km at res 8
    const NEARBY_RADIUS_METERS = 10000; // 10 km strict cutoff
    const NEARBY_LIMIT = 20;

    /* ── STEP 0: Input Validation ── */
    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);

    if (
      !latitude || !longitude ||
      isNaN(latNum) || isNaN(lngNum) ||
      latNum < -90 || latNum > 90 ||
      lngNum < -180 || lngNum > 180
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid latitude and longitude are required",
      });
    }

    /* ── STEP 1: H3 Search Area ── */
    const centerCell = latLngToCell(latNum, lngNum, NEARBY_RESOLUTION);
    const searchCells = gridDisk(centerCell, NEARBY_RING_SIZE);

    /* ── STEP 2: DB Query — no limit here, filter first ── */
    const candidateOrders = await VendorOrder.find({
      status: "PENDING",
      h3Index: { $in: searchCells },
      assigned_engineer_id: null,
      rejected_engineers: { $ne: engineerId },
    })
      .sort({ created_at: -1 })
      .lean();

    /* ── STEP 3: Exact Distance Filter + Map ── */
    const ordersWithDistance = [];

    for (const order of candidateOrders) {
      const coords = order.location?.coordinates;
      if (!coords || coords.length < 2) continue;

      const [orderLng, orderLat] = coords;
      const distanceInMeters = getDistanceInMeters(latNum, lngNum, orderLat, orderLng);

      // Strict radius cutoff — H3 hexagon edges are not perfect circles
      if (distanceInMeters > NEARBY_RADIUS_METERS) continue;

      // Redact sensitive fields
      const {
        complete_address,
        location,
        contact_phone,
        contact_name,
        l1_support_number,
        l1_support_name,
        ...safeOrder
      } = order;

      ordersWithDistance.push({
        ...safeOrder,
        distance: parseFloat((distanceInMeters / 1000).toFixed(2)), // number, not string
        distanceUnit: "km",
        address: "Hidden until acceptance",
        customerName: "Customer",
        customerPhone: "Hidden",
      });
    }

    /* ── STEP 4: Sort by closest → then limit ── */
    ordersWithDistance.sort((a, b) => a.distance - b.distance);
    const finalOrders = ordersWithDistance.slice(0, NEARBY_LIMIT);

    return res.status(200).json({
      success: true,
      count: finalOrders.length,
      orders: finalOrders,
    });

  } catch (err) {
    console.error("Nearby Orders Error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const updateVendorOrderWorkStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { workStatus } = req.body;
    const engineerId = req.user.id;

    console.log('=== UPDATE VENDOR WORK STATUS ===');
    console.log('Order ID:', orderId);
    console.log('Engineer ID:', engineerId);
    console.log('Target Work Status:', workStatus);

    if (!["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "STARTED"].includes(workStatus)) {
      console.log('❌ Invalid workStatus:', workStatus);
      return res.status(400).json({
        success: false,
        message: "Invalid work status value"
      });
    }

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ success: false, message: "Invalid Order ID format" });
    }

    const order = await VendorOrder.findOne({
      _id: orderId,
      assigned_engineer_id: engineerId
    });

    if (!order) {
      console.log('❌ Order not found or not assigned to this engineer:', { orderId, engineerId });
      return res.status(404).json({
        success: false,
        message: `Order not found or not assigned to you`
      });
    }

    if (order.status === 'ON_HOLD') {
      return res.status(403).json({
        success: false,
        message: "Order is currently on hold. You cannot update its status."
      });
    }

    // Geo-fencing verification for STARTED status (Temporarily disabled for vendor orders)
    // if (workStatus === "STARTED") {
    //   const { latitude, longitude } = req.body;
    //   if (!latitude || !longitude) {
    //     return res.status(400).json({
    //       success: false,
    //       message: "Location verification is required to start work."
    //     });
    //   }
    //
    //   if (order.location && order.location.coordinates) {
    //     const orderLng = order.location.coordinates[0];
    //     const orderLat = order.location.coordinates[1];
    //     const distance = getDistanceInMeters(latitude, longitude, orderLat, orderLng);
    //     console.log(`📏 Backend Vendor Distance Check: ${distance.toFixed(2)}m`);
    //
    //     if (distance > 300) {
    //       return res.status(400).json({
    //         success: false,
    //         message: `Location verification failed. You are ${distance.toFixed(0)}m away. Please be within 300m.`
    //       });
    //     }
    //   }
    // }

    // Atomic update to avoid triggering validation errors on unrelated fields
    const updatedOrder = await VendorOrder.findByIdAndUpdate(
      orderId,
      {
        $set: { work_status: workStatus },
        $push: {
          tracking: {
            status: workStatus === 'STARTED' ? 'STARTED' : workStatus,
            title: workStatus === 'STARTED' ? 'Work Started' :
              workStatus === 'COMPLETED' ? 'Work Completed' : `Status: ${workStatus}`,
            timestamp: new Date()
          }
        }
      },
      { new: true } // Removed runValidators: true to prevent 500 errors on legacy/inconsistent data
    );

    if (!updatedOrder) {
      return res.status(404).json({
        success: false,
        message: "Failed to update work status"
      });
    }

    console.log('✅ Work status updated to:', updatedOrder.work_status);

    // Notify Vendor (Fire-and-forget with error logging)
    const payload = {
      call_id: updatedOrder.call_id,
      status: updatedOrder.work_status,
      engineer_id: engineerId
    };

    console.log("Notifying Vendor of status update:", payload);

    axios.post(
      "https://door2fyvendor-gv4g4.ondigitalocean.app/calls/engineer/assignment-result",
      payload,
    ).catch(webhookErr => {
      console.error("⚠️ Vendor Webhook Notification Failed (Non-fatal):", webhookErr.message);
    });

    return res.status(200).json({
      success: true,
      message: "Work status updated successfully",
      data: updatedOrder
    });
  } catch (err) {
    console.error("Update Work Status Error:", err);
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
    const files = req.files;

    console.log('>>> [BACKEND] Received completeOrder request for ID:', orderId);
    console.log('>>> [BACKEND] Files received count:', files?.length || 0);

    // 1. Basic Validation
    if (!orderId) return res.status(400).json({ success: false, message: "Order ID is required." });
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, message: "Please upload at least one completion image." });
    }

    // The files are already uploaded to Cloudinary by multer-storage-cloudinary
    const imageUrls = files.map(file => file.path);

    // 3. Update Order Status and Save Image URLs
    const order = await VendorOrder.findOneAndUpdate(
      {
        _id: orderId,
        assigned_engineer_id: engineerId,
        status: "ACCEPTED"
      },
      {
        $set: {
          status: "COMPLETED",
          work_status: "COMPLETED",
          completed_at: new Date(),
          completion_images: imageUrls
        }
      },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found or you aren't authorized to complete it."
      });
    }

    // 4. Update Engineer Availability
    await Engineer.findByIdAndUpdate(engineerId, { isAvailable: true });

    // --- NEW: CREDIT WALLET FOR VENDOR WORK ---
    try {
      const { creditEngineerWallet } = await import('../../finance/wallet/wallet.service.js');
      if (order.order_price > 0) {
        await creditEngineerWallet({
          engineerId,
          amount: order.order_price,
          orderId: order._id.toString(),
          category: 'earning'
        });
        console.log(`Credited ₹${order.order_price} to wallet for vendor job ${order._id}`);
      }
    } catch (creditError) {
      console.error("Failed to credit wallet for vendor job:", creditError);
    }
    // ------------------------------------------

    // 5. Notify Vendor Webhook (Standard Payload)
    const webhookPayload = {
      call_id: order.call_id,
      status: "COMPLETED",
      completed_at: order.completed_at,
      proof_images: imageUrls
    };

    // Fire-and-forget or await depending on vendor reliability
    axios.post("https://door2fyvendor-gv4g4.ondigitalocean.app/calls/engineer/assignment-result", webhookPayload)
      .catch(err => console.error("Vendor Webhook Error:", err.message));

    console.log('>>> [BACKEND] Order completed successfully for ID:', orderId);
    return res.status(200).json({
      success: true,
      message: "Order completed successfully.",
      order,
    });

  } catch (err) {
    console.error(">>> [BACKEND] Complete Order Error:", err);
    res.status(500).json({ success: false, message: err.message || "Internal server error" });
  }
};

export const getAcceptedVendorOrders = async (req, res) => {
  try {
    const engineerId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const orders = await VendorOrder.find({
      assigned_engineer_id: engineerId,
      status: "ACCEPTED",
    })
      .sort({ accepted_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const mappedOrders = orders.map(order => {
      const showPhone = order.status === 'ACCEPTED' || order.work_status === 'STARTED' || order.work_status === 'IN_PROGRESS' || order.status === 'COMPLETED';
      return {
        ...order,
        isVendorOrder: true,
        contact_phone: order.contact_phone || "N/A",
        l1_support_number: order.l1_support_number || "N/A"
      };
    });

    return res.status(200).json({
      success: true,
      count: mappedOrders.length,
      page,
      limit,
      data: mappedOrders,
      orders: mappedOrders, // Provide both for compatibility
    });
  } catch (err) {
    console.error("Get Accepted Vendor Orders Error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getRejectedVendorOrders = async (req, res) => {
  try {
    const engineerId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const orders = await VendorOrder.find({
      rejected_engineers: engineerId,
    })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const mappedOrders = orders.map(order => ({
      ...order,
      isVendorOrder: true,
      contact_phone: "Hidden",
      l1_support_number: "Hidden"
    }));

    return res.status(200).json({
      success: true,
      count: mappedOrders.length,
      page,
      limit,
      data: mappedOrders,
      orders: mappedOrders,
    });
  } catch (err) {
    console.error("Get Rejected Vendor Orders Error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getCompletedVendorOrders = async (req, res) => {
  try {
    const engineerId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const orders = await VendorOrder.find({
      assigned_engineer_id: engineerId,
      status: "COMPLETED",
    })
      .sort({ completed_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const mappedOrders = orders.map(order => {
      const showPhone = order.status === 'ACCEPTED' || order.work_status === 'STARTED' || order.work_status === 'IN_PROGRESS' || order.status === 'COMPLETED';
      return {
        ...order,
        isVendorOrder: true,
        contact_phone: order.contact_phone || "N/A",
        l1_support_number: order.l1_support_number || "N/A"
      };
    });

    return res.status(200).json({
      success: true,
      count: mappedOrders.length,
      page,
      limit,
      data: mappedOrders,
      orders: mappedOrders,
    });
  } catch (err) {
    console.error("Get Completed Vendor Orders Error:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};



// export const getNearbyVendorOrders = async (req, res) => {
//   try {
//     const engineerId = req.user.id;
//     const { latitude, longitude } = req.query;

//     if (!latitude || !longitude) {
//       return res.status(400).json({
//         success: false,
//         message: "Latitude and longitude are required"
//       });
//     }

//     const latNum = parseFloat(latitude);
//     const lngNum = parseFloat(longitude);

//     // 1. Get the H3 cell and neighboring hexagons
//     const centerCell = latLngToCell(latNum, lngNum, H3_RESOLUTION);
//     const searchCells = gridDisk(centerCell, SEARCH_RING_SIZE);

//     // 2. Find orders
//     const nearbyOrders = await VendorOrder.find({
//       status: "PENDING",
//       h3Index: { $in: searchCells },
//       assigned_engineer_id: null,
//       rejected_engineers: { $ne: engineerId }
//     })
//       .sort({ created_at: -1 })
//       .limit(20)
//       .lean();

//     // 3. Map through orders to add calculated distance to each
//     const ordersWithDistance = nearbyOrders.map(order => {
//       // In MongoDB, coordinates are usually [lng, lat]
//       const orderLng = order.location.coordinates[0];
//       const orderLat = order.location.coordinates[1];

//       const distanceInMeters = getDistanceInMeters(
//         latNum,
//         lngNum,
//         orderLat,
//         orderLng
//       );

//       // STRICT REDACTION for Nearby (Pending) orders
//       const { complete_address, location, contact_phone, contact_name, l1_support_number, l1_support_name, ...safeOrder } = order;

//       return {
//         ...safeOrder,
//         distance: (distanceInMeters / 1000).toFixed(2), // Convert to KM with 2 decimals
//         distanceUnit: "km",
//         address: "Hidden until acceptance",
//         customerName: "Customer",
//         customerPhone: "Hidden"
//       };
//     });

//     // 4. (Optional) Sort by closest distance after calculation
//     ordersWithDistance.sort((a, b) => a.distance - b.distance);

//     return res.status(200).json({
//       success: true,
//       count: ordersWithDistance.length,
//       orders: ordersWithDistance,
//     });
//   } catch (err) {
//     console.error("H3 Nearby Orders Error:", err);
//     return res.status(500).json({
//       success: false,
//       message: "Internal server error"
//     });
//   }
// };




export const 
toggleVendorOrderHoldWebhook = async (req, res) => {
  try {
    const { call_id, vendor_id } = req.body;

    if (!call_id || !vendor_id) {
      return res.status(400).json({ success: false, message: 'call_id and vendor_id are required' });
    }

    const order = await VendorOrder.findOne({ call_id });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Vendor Order not found' });
    }

    if (order.vendor_id !== vendor_id) {
      return res.status(403).json({ success: false, message: 'Unauthorized: Vendor ID mismatch' });
    }

    // Check if the order can be put on hold (engineer has not started)
    if (['STARTED', 'IN_PROGRESS', 'COMPLETED'].includes(order.work_status)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify hold status after the engineer has started the work'
      });
    }

    if (order.status !== 'ON_HOLD') {
      // Put on hold
      order.status = 'ON_HOLD';
      order.tracking.push({
        status: 'ON_HOLD',
        title: 'Order on Hold',
        subTitle: 'Order paused by vendor webhook',
        timestamp: new Date()
      });
    } else {
      // Remove hold
      // Determine the previous state based on whether an engineer is assigned
      order.status = order.assigned_engineer_id ? 'ACCEPTED' : 'PENDING';
      order.tracking.push({
        status: order.status,
        title: 'Hold Removed',
        subTitle: `Order resumed to ${order.status} state`,
        timestamp: new Date()
      });
    }

    await order.save();

    return res.status(200).json({
      success: true,
      message: `Order hold status toggled. Current status: ${order.status}`,
      data: order
    });
  } catch (err) {
    console.error('Toggle hold webhook error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};


export const redispatchVendorOrderWebhook = async (req, res) => {
  try {
    const { call_id, vendor_id } = req.body;

    if (!call_id || !vendor_id) {
      return res.status(400).json({ success: false, message: 'call_id and vendor_id are required' });
    }

    const order = await VendorOrder.findOne({ call_id });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Vendor Order not found' });
    }

    if (order.vendor_id !== vendor_id) {
      return res.status(403).json({ success: false, message: 'Unauthorized: Vendor ID mismatch' });
    }

    // Check if the order is already accepted by an engineer
    if (order.assigned_engineer_id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot redispatch an order that is already accepted by an engineer'
      });
    }

    // Reset status to PENDING if it was EXPIRED or CANCELLED
    if (order.status === 'EXPIRED' || order.status === 'CANCELLED') {
      order.status = 'PENDING';
      order.tracking.push({
        status: 'PENDING',
        title: 'Order Redispatched',
        subTitle: 'Order was redispatched via vendor webhook',
        timestamp: new Date()
      });
      await order.save();
    }

    // Notify engineers
    const { notifyEngineersForOrder } = await import('../../notification/engineers/notificationEngineer.service.js');
    const notifyResult = await notifyEngineersForOrder(order);

    if (!notifyResult.success) {
      return res.status(200).json({
        success: false,
        message: 'Order status reset to PENDING, but no engineers found nearby to notify',
        data: order
      });
    }

    return res.status(200).json({
      success: true,
      message: `Order successfully redispatched to ${notifyResult.count} engineers`,
      data: order
    });
  } catch (err) {
    console.error('Redispatch webhook error:', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
