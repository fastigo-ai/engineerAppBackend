import { Engineer } from "../../models/engineersModal.js";
import VendorOrder from "../../models/vendorOrderModal.js";
import { matchEngineers } from "../../services/vendorRequestService.js";
import { getDistanceInMeters } from "../../utils/distance.js";
import { latLngToCell, gridDisk } from "h3-js";
const toRad = (value) => (value * Math.PI) / 180;

// const getDistanceInMeters = (lat1, lon1, lat2, lon2) => {
//   const R = 6371000;
//   const dLat = toRad(lat2 - lat1);
//   const dLon = toRad(lon2 - lon1);

//   const a =
//     Math.sin(dLat / 2) ** 2 +
//     Math.cos(toRad(lat1)) *
//       Math.cos(toRad(lat2)) *
//       Math.sin(dLon / 2) ** 2;

//   return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
// };

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
    const payload = req.body;

    const {
      vendor_id,
      call_id,
      location
    } = payload;

    if (!vendor_id || !call_id) {
      return res.status(400).json({
        success: false,
        message: "vendor_id and call_id are required"
      });
    }

    // 🔒 Location validation
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

    /* ==================================================
       1️⃣ ATOMIC CREATE + LOCK (NO RACE CONDITION)
    ================================================== */

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
        },
      },
      { upsert: true, new: true }
    );

   

    /* ==================================================
       2️⃣ MATCH ENGINEERS
    ================================================== */

    const matchedEngineers = await matchEngineers({ location: order.location });

    

    if (!matchedEngineers.length) {
      await VendorOrder.findByIdAndUpdate(order._id, {
        status: "EXPIRED",
        failure_reason: "NO_ENGINEERS_AVAILABLE"
      });

      return res.status(200).json({
        success: false,
        message: "No engineers available",
        orderId: order._id,
      });
    }

    /* ==================================================
       3️⃣ ASYNC NOTIFICATION
    ================================================== */
    // notifyEngineers(matchedEngineers, order);

    return res.status(200).json({
      success: true,
      matchType: "H3_GEO_MATCH",
      orderId: order._id,
      matchedEngineers,
      results: {
        totalFound: matchedEngineers.length
      }
    });

  } catch (err) {
    console.error("Match Error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};


// export const getVendorRequests = async (req, res) => {
//   try {
//     const { location, orderId } = req.body;

//     if (
//       !location?.coordinates ||
//       location.coordinates.length !== 2
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid location format"
//       });
//     }

//     const [lng, lat] = location.coordinates;

//     if (
//       lat < -90 || lat > 90 ||
//       lng < -180 || lng > 180
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid latitude or longitude"
//       });
//     }

//     const H3_RESOLUTION = 8;
//     const MAX_RADIUS_KM = 25;

//     // Correct ring size for 25km at res 8
//     const RING_SIZE = Math.ceil((MAX_RADIUS_KM * 1000) / 460);

//     /* ------------------ H3 SEARCH ------------------ */
//     const orderCell = latLngToCell(lat, lng, H3_RESOLUTION);
//     const searchCells = gridDisk(orderCell, RING_SIZE);

//     /* ------------------ DB QUERY ------------------ */
//     const engineers = await Engineer.find({
//       isActive: true,
//       isAvailable: true,
//       isDeleted: false,
//       isBlocked: false,
//       isSuspended: false,
//       h3Index: { $in: searchCells }
//     })
//       .select("_id name mobile location h3Index")
//       .lean();

//     if (!engineers.length) {
//       return res.json({
//         success: true,
//         results: { totalFound: 0, engineers: [] },
//         orderId
//       });
//     }

//     /* ------------------ PRECISE FILTER ------------------ */
//     const matchedEngineers = engineers
//       .map(e => {
//         const [eLng, eLat] = e.location.coordinates;
//         return {
//           ...e,
//           distanceInMeters: getDistanceInMeters(
//             lat, lng, eLat, eLng
//           )
//         };
//       })
//       .filter(e => e.distanceInMeters <= MAX_RADIUS_KM * 1000)
//       .sort((a, b) => a.distanceInMeters - b.distanceInMeters);

//     return res.json({
//       success: true,
//       matchType: "H3_GEO_MATCH",
//       results: {
//         totalFound: matchedEngineers.length,
//         engineers: matchedEngineers
//       },
//       orderId
//     });

//   } catch (error) {
//     console.error("Match Error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Internal server error"
//     });
//   }
// };