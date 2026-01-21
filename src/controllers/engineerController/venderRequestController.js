import { Engineer } from "../../models/engineersModal.js";
import VendorOrder from "../../models/vendorOrderModal.js";
import { createAndMatchVendorOrder, acceptOrderService } from "../../services/vendorRequestService.js";
import { getDistanceInMeters } from "../../utils/distance.js";
import { latLngToCell, gridDisk } from "h3-js";


export const servicableLocation = async (req, res) => {
  try {
    const { project_id, calls } = req.body;

    if (!Array.isArray(calls) || calls.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Calls array is required and cannot be empty",
      });
    }

    const SERVICE_RADIUS = 20000; // 20 km
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
      project_id,
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

export const getVendorRequests = async (req, res) => {
  try {
    const { vendor_id, call_id, location } = req.body;

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





