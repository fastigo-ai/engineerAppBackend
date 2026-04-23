import mongoose from "mongoose";
import { Engineer } from "../../models/engineersModal.js";
import VendorOrder from "../../models/vendorOrderModal.js";
import { createAndMatchVendorOrder, acceptOrderService, rejectOrderService } from "../../services/vendorRequestService.js";
import { getDistanceInMeters } from "../../utils/distance.js";
import { latLngToCell, gridDisk } from "h3-js";
import { getIO } from "../../config/socket.js";
import { uploadToCloudinary } from "../../utils/uploadToCloudinary.js";
import axios from 'axios';
const H3_RESOLUTION = 8;
const SEARCH_RING_SIZE = 30;

export const servicableLocation = async (req, res) => {
  try {
    const { projectId, calls } = req.body;

    if (!Array.isArray(calls) || calls.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Calls array is required and cannot be empty",
      });
    }

    const SERVICE_RADIUS = 20000;
    const H3_RESOLUTION = 8;
    const RING_SIZE = 22;

    const callMap = new Map();
    const allRequiredCells = new Set();

    /* ----------------------------------------------------
       STEP 1: PREPARE H3 SEARCH AREAS
    ---------------------------------------------------- */
    for (const call of calls) {
      const { call_id, lat, lng } = call;

      if (typeof lat !== "number" || typeof lng !== "number") continue;

      try {
        const centerCell = latLngToCell(lat, lng, H3_RESOLUTION);
        const lookupCells = gridDisk(centerCell, RING_SIZE);

        callMap.set(call_id, { lat, lng, lookupCells });

        for (const cell of lookupCells) {
          allRequiredCells.add(cell);
        }
      } catch (err) {
        console.error(`H3 error for call ${call_id}`, err);
      }
    }

    /* ----------------------------------------------------
       STEP 2: SINGLE FAST DB QUERY
    ---------------------------------------------------- */
    const availableEngineers = await Engineer.find({
      isActive: true,
      isAvailable: true,
      isDeleted: false,
      isBlocked: false,
      isSuspended: false,
      h3Index: { $in: Array.from(allRequiredCells) }
    }).select("h3Index location").lean();

    /* ----------------------------------------------------
       STEP 3: GROUP ENGINEERS BY H3 CELL
    ---------------------------------------------------- */
    const cellToEngineers = new Map();

    for (const eng of availableEngineers) {
      if (!cellToEngineers.has(eng.h3Index)) {
        cellToEngineers.set(eng.h3Index, []);
      }
      cellToEngineers.get(eng.h3Index).push(eng);
    }

    /* ----------------------------------------------------
       STEP 4: FINAL SERVICEABILITY CHECK (EXACT DISTANCE)
    ---------------------------------------------------- */
    const serviceable = [];
    const non_serviceable = [];

    for (const call of calls) {
      const data = callMap.get(call.call_id);

      if (!data) {
        non_serviceable.push({ call_id: call.call_id, reason: "Invalid coordinates" });
        continue;
      }

      const { lat, lng, lookupCells } = data;
      let found = false;

      // Only check engineers inside candidate cells
      for (const cell of lookupCells) {
        const engineersInCell = cellToEngineers.get(cell);
        if (!engineersInCell) continue;

        for (const eng of engineersInCell) {
          const [engLng, engLat] = eng.location.coordinates;

          const distance = getDistanceInMeters(lat, lng, engLat, engLng);

          if (distance <= SERVICE_RADIUS) {
            found = true;
            break;
          }
        }

        if (found) break;
      }

      if (found) {
        serviceable.push({ call_id: call.call_id });
      } else {
        non_serviceable.push({ call_id: call.call_id });
      }
    }

    /* ----------------------------------------------------
       STEP 5: RESPONSE
    ---------------------------------------------------- */
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
    console.error("Bulk Serviceability Error:", err);
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
    const { orderId } = req.body;
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

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: "Latitude and longitude are required"
      });
    }

    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);

    // 1. Get the H3 cell and neighboring hexagons
    const centerCell = latLngToCell(latNum, lngNum, H3_RESOLUTION);
    const searchCells = gridDisk(centerCell, SEARCH_RING_SIZE);

    // 2. Find orders
    const nearbyOrders = await VendorOrder.find({
      status: "PENDING",
      h3Index: { $in: searchCells },
      assigned_engineer_id: null,
      rejected_engineers: { $ne: engineerId }
    })
      .sort({ created_at: -1 })
      .limit(20)
      .lean();

    // 3. Map through orders to add calculated distance to each
    const ordersWithDistance = nearbyOrders.map(order => {
      // In MongoDB, coordinates are usually [lng, lat]
      const orderLng = order.location.coordinates[0];
      const orderLat = order.location.coordinates[1];

      const distanceInMeters = getDistanceInMeters(
        latNum,
        lngNum,
        orderLat,
        orderLng
      );

      // STRICT REDACTION for Nearby (Pending) orders
      const { complete_address, location, contact_phone, contact_name, l1_support_number, l1_support_name, ...safeOrder } = order;

      return {
        ...safeOrder,
        distance: (distanceInMeters / 1000).toFixed(2), // Convert to KM with 2 decimals
        distanceUnit: "km",
        address: "Hidden until acceptance",
        customerName: "Customer",
        customerPhone: "Hidden"
      };
    });

    // 4. (Optional) Sort by closest distance after calculation
    ordersWithDistance.sort((a, b) => a.distance - b.distance);

    return res.status(200).json({
      success: true,
      count: ordersWithDistance.length,
      orders: ordersWithDistance,
    });
  } catch (err) {
    console.error("H3 Nearby Orders Error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
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

    const query = {
      _id: new mongoose.Types.ObjectId(orderId),
      assigned_engineer_id: new mongoose.Types.ObjectId(engineerId)
    };
    console.log('[UpdateWorkStatus] Querying with:', query);

    const order = await VendorOrder.findOneAndUpdate(
      query,
      { work_status: workStatus },
      { new: true }
    );

    if (!order) {
      console.log('❌ Order not found or not assigned to this engineer:', { orderId, engineerId });
      return res.status(404).json({
        success: false,
        message: `Order ${orderId} not found or not assigned to engineer ${engineerId}`,
        debug: { orderId, engineerId }
      });
    }

    console.log('✅ Work status updated to:', order.work_status);

    const payload = {
      call_id: order.call_id,
      status: order.work_status,
      engineer_id: engineerId
    };

    console.log("Notifying Vendor of acceptance with payload:", payload);

    await axios.post(
      "https://door2fyvendor-gv4g4.ondigitalocean.app/calls/engineer/assignment-result",
      payload,
    );

    return res.status(200).json({
      success: true,
      message: "Work status updated successfully",
      data: order
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

    // 2. Parallel Upload to Cloudinary
    console.log(`[CompleteOrder] Uploading ${files.length} images to Cloudinary...`);
    const uploadResults = await Promise.all(
      files.map((file, index) => {
        console.log(`[CompleteOrder] Starting upload for image ${index + 1}/${files.length}`);
        return uploadToCloudinary(file.buffer, "order_completions")
          .then(res => {
            console.log(`[CompleteOrder] Image ${index + 1} uploaded successfully`);
            return res;
          })
          .catch(err => {
            console.error(`[CompleteOrder] Image ${index + 1} upload failed:`, err.message);
            throw err;
          });
      })
    );

    // Extract only the URLs for the database
    const imageUrls = uploadResults.map(result => result.url);

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
      const { creditEngineerWallet } = await import('../../services/walletService.js');
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
      const showPhone = order.work_status === 'STARTED' || order.work_status === 'IN_PROGRESS' || order.status === 'COMPLETED';
      return { 
        ...order, 
        isVendorOrder: true,
        contact_phone: showPhone ? order.contact_phone : "Hidden until work starts",
        l1_support_number: showPhone ? order.l1_support_number : "Hidden until work starts"
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
      const showPhone = order.work_status === 'STARTED' || order.work_status === 'IN_PROGRESS' || order.status === 'COMPLETED';
      return { 
        ...order, 
        isVendorOrder: true,
        contact_phone: showPhone ? order.contact_phone : "Hidden until work starts",
        l1_support_number: showPhone ? order.l1_support_number : "Hidden until work starts"
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


