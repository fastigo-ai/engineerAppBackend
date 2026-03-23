import { latLngToCell, gridDisk } from "h3-js";
import { Engineer } from "../models/engineersModal.js";
import { getDistanceInMeters } from "../utils/distance.js";
import { getIO } from "../config/socket.js";
import { admin } from "../config/firebase.js";

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

  for (const eng of engineers) {
    const engineerRoom = eng.engineer_id.toString();

    // 1. Send order request via Socket.io
    io.to(engineerRoom).emit("NEW_ORDER_REQUEST", {
      order_id: orderData.id,
      call_id: orderData.call_id || orderData.id,
      address: orderData.address,
      branch_name: orderData.branch_name,
      state_name: orderData.state_name,
      distance: eng.distanceKm,
      support_type: orderData.type,
      order_price: orderData.price || "To Be Decided",
      timer: 30,
      location: orderData.location
    });

    // 2. Send push notification via FCM if fcmToken exists
    if (eng.fcmToken) {
      try {
        const message = {
          notification: {
            title: 'New Job Request!',
            body: `New ${orderData.type || 'job'} available at ${orderData.address || 'nearby location'}`,
          },
          data: {
            order_id: orderData.id.toString(),
            support_type: orderData.type || '',
            complete_address: orderData.address || '',
            type: 'NEW_ORDER'
          },
          token: eng.fcmToken,
        };

        admin.messaging().send(message)
          .then((response) => {
            console.log('Successfully sent push notification:', response);
          })
          .catch((error) => {
            console.error('Error sending push notification:', error);
          });
      } catch (err) {
        console.error('FCM send error:', err);
      }
    }

    // 3. Join ONLY online sockets to the order room
    const sockets = await io.in(engineerRoom).fetchSockets();
    if (sockets.length > 0) {
      io.in(engineerRoom).socketsJoin(orderRoom);
      console.log(`Engineer ${engineerRoom} joined ${orderRoom}`);
    }
  }
};

/**
 * Matches engineers based on location using H3 grid.
 * @param {Object} location - GeoJSON location {type, coordinates: [lng, lat]}
 */
export async function matchEngineersByLocation({ location }) {
  if (!location?.coordinates || location.coordinates.length !== 2) {
    throw new Error("Invalid location format");
  }

  const [lng, lat] = location.coordinates;
  const h3Cell = latLngToCell(lat, lng, H3_RESOLUTION);
  const searchCells = gridDisk(h3Cell, RING_SIZE);

  // Find active and available engineers in the H3 grid
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
  .select("_id name mobile location rating totalJobs completedJobs h3Index isAvailable isActive fcmToken")
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
        engineer_id: e._id,
        name: e.name,
        mobile: e.mobile,
        rating: e.rating,
        h3Index: e.h3Index,
        fcmToken: e.fcmToken,
        distanceInMeters: distance,
        distanceKm: +(distance / 1000).toFixed(2)
      };
    })
    .filter(e => e.distanceInMeters <= MAX_RADIUS_KM * 1000)
    .sort((a, b) => a.distanceInMeters - b.distanceInMeters)
    .slice(0, MAX_RESULTS);

  return matched;
}
