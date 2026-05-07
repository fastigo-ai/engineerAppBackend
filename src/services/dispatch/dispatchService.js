import { Order } from "../../models/orderSchema.js";
import { Engineer } from "../../models/engineersModal.js";
import { EngineerSchedule } from "../../models/engineerSchedule.js";
import { notifyMatchedEngineers } from "../notificationEngineerService.js"
import { getDistanceInMeters } from "../../utils/distance.js";
import { gridDisk } from "h3-js";

const MAX_ENGINEERS = 5;
const HEARTBEAT_TIMEOUT = 15000;
const MAX_RADIUS = 5;

// export const dispatchOrder = async (orderId) => {
//     try {
//         // 1️ Fetch Order
//         const order = await Order.findById(orderId);



//         if (!order) throw new Error("Order not found");

//         if (order.status !== "Searching") {
//             return;
//         }

//         // 2️ Compute time window
//         let startTime;
//         let endTime;

//         if (order.orderType === "SCHEDULED") {
//             startTime = new Date(order.scheduledAt);
//             endTime = new Date(
//                 startTime.getTime() + order.totalDuration * 60000
//             );
//         } else {
//             startTime = new Date();
//             endTime = new Date(
//                 Date.now() + order.totalDuration * 60000
//             );
//         }

//         let selectedEngineers = [];

//         // 3️ Dynamic Radius Expansion
//         for (let radius = 1; radius <= MAX_RADIUS; radius++) {
//             const cells = gridDisk(order.h3Index, radius);

//             // 4️ Fetch engineers (alive + online)
//             const engineers = await Engineer.find({
//                 h3Index: { $in: cells },
//                 status: "ONLINE",
//                 isActive: true,
//                 isBlocked: false,
//                 isSuspended: false,
//                 // lastHeartbeat: {
//                 //     $gte: new Date(Date.now() - HEARTBEAT_TIMEOUT)
//                 // }
//             }).select("_id rating h3Index location name email mobile");

//             if (!engineers.length) continue;

//             // 5️ Batch availability check (NO N+1)
//             const engineerIds = engineers.map(e => e._id);

//             const conflicts = await EngineerSchedule.find({
//                 engineerId: { $in: engineerIds },
//                 status: { $in: ["BOOKED", "ONGOING"] },
//                 startTime: { $lt: endTime },
//                 endTime: { $gt: startTime }
//             }).select("engineerId");

//             const busySet = new Set(
//                 conflicts.map(c => c.engineerId.toString())
//             );

//             const availableEngineers = engineers.filter(
//                 eng => !busySet.has(eng._id.toString())
//             );

//             if (!availableEngineers.length) continue;

//             // 6️ Ranking (rating for now)
//             availableEngineers.sort((a, b) => b.rating - a.rating);

//             selectedEngineers = availableEngineers.slice(0, MAX_ENGINEERS);

//             console.log(
//                 `Found ${selectedEngineers.length} engineers at radius ${radius}`
//             );

//             break; //  STOP when found
//         }

//         // if (!selectedEngineers.length) {
//         //     console.log(" No engineers found after max radius");

//         //     //  Optional retry (production: use queue like BullMQ)
//         //     setTimeout(() => {
//         //         dispatchOrder(orderId);
//         //     }, 10000);

//         //     return;
//         // }

//         // 7️ Send order request
//         // for (let eng of selectedEngineers) {
//         //     await sendOrderRequest(eng, order);
//         // }

//         selectedEngineers.forEach(eng => {
//             eng.distanceKm = getDistanceInMeters(
//                 order.location.coordinates[1],
//                 order.location.coordinates[0],
//                 eng.location.coordinates[1],
//                 eng.location.coordinates[0]
//             );
//         });

//         order.type = "User Order";
//         await notifyMatchedEngineers(selectedEngineers, order);

//         return selectedEngineers;

//     } catch (error) {
//         console.error("Dispatch Error:", error);
//         throw error;
//     }
// };


export const findMatchingEngineers = async (order, startTime, endTime) => {
    let selectedEngineers = [];

    for (let radius = 1; radius <= MAX_RADIUS; radius++) {
        const cells = gridDisk(order.h3Index, radius);

        // 1️ Fetch engineers
        const engineers = await Engineer.find({
            h3Index: { $in: cells },
            status: "ONLINE",
            isActive: true,
            isBlocked: false,
            isSuspended: false
        }).select("_id rating location name email mobile");

        if (!engineers.length) continue;

        // 2️ Availability check (batch)
        const engineerIds = engineers.map(e => e._id);

        const conflicts = await EngineerSchedule.find({
            engineerId: { $in: engineerIds },
            status: { $in: ["BOOKED", "ONGOING"] },
            startTime: { $lt: endTime },
            endTime: { $gt: startTime }
        }).select("engineerId");

        const busySet = new Set(
            conflicts.map(c => c.engineerId.toString())
        );

        const availableEngineers = engineers.filter(
            eng => !busySet.has(eng._id.toString())
        );

        if (!availableEngineers.length) continue;

        // 3️ Distance calculation
        availableEngineers.forEach(eng => {

            let dist = getDistanceInMeters(
                order.location.coordinates[1],
                order.location.coordinates[0],
                eng.location.coordinates[1],
                eng.location.coordinates[0]
            );
            eng.distanceKm = +(dist / 1000).toFixed(2);
        });

        // 4️ Ranking (distance + rating)
        availableEngineers.sort((a, b) => {
            if (a.distanceKm !== b.distanceKm) {
                return a.distanceKm - b.distanceKm; // closer first
            }
            return b.rating - a.rating; // higher rating next
        });

        selectedEngineers = availableEngineers.slice(0, MAX_ENGINEERS);

        console.log(
            ` Found ${selectedEngineers.length} engineers at radius ${radius}`
        );

        break;
    }

    return selectedEngineers;
};



export const dispatchOrder = async (orderId) => {
    try {
        // 1️ Fetch Order
        const order = await Order.findById(orderId).populate('servicePlan servicePlans');

        if (!order) throw new Error("Order not found");

        if (order.status !== "Searching") {
            return;
        }

        // 2️ Compute time window
        let startTime;
        let endTime;

        if (order.orderType === "SCHEDULED") {
            startTime = new Date(order.scheduledAt);
            endTime = new Date(
                startTime.getTime() + order.totalDuration * 60000
            );
        } else {
            startTime = new Date();
            endTime = new Date(
                Date.now() + order.totalDuration * 60000
            );
        }

        // 3️ Get matching engineers (delegated)
        const selectedEngineers = await findMatchingEngineers(
            order,
            startTime,
            endTime
        );

        if (!selectedEngineers.length) {
            console.log(" No engineers found");

            // 🔔 Notify User that we are still searching
            if (order.userId) {
                try {
                    const { sendPushToUser } = await import("../notification/notificationService.js");
                    sendPushToUser(order.userId, {
                        notification: {
                            title: 'Searching for Partners...',
                            body: 'We are currently looking for the best technician near you. Thank you for your patience.',
                        },
                        data: {
                            order_id: order._id.toString(),
                            type: 'SEARCHING_ENGINEERS'
                        }
                    });
                } catch (notifyError) {
                    // Silently fail for "Still searching" info notifications
                }
            }

            // optional retry
            // setTimeout(() => dispatchOrder(orderId), 10000);

            return;
        }

        // 4️ Notify
        order.type = "User Order";
        await notifyMatchedEngineers(selectedEngineers, order);

        return selectedEngineers;

    } catch (error) {
        console.error("Dispatch Error:", error);
        throw error;
    }
};


