import { latLngToCell, gridDisk } from "h3-js";
import { Engineer } from "../models/engineersModal.js";
import { getDistanceInMeters } from "../utils/distance.js";

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