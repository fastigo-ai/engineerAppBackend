import { Order } from "../../models/orderSchema.js";
import { Engineer } from "../../models/engineersModal.js";
import { EngineerSchedule } from "../../models/engineerSchedule.js";
import { gridDisk } from "h3-js";

const MAX_ENGINEERS = 5;
const HEARTBEAT_TIMEOUT = 15000;
const MAX_RADIUS = 5;

export const dispatchOrder = async (orderId) => {
    try {
        // 1️ Fetch Order
        const order = await Order.findById(orderId);

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

        let selectedEngineers = [];

        // 3️ Dynamic Radius Expansion
        for (let radius = 1; radius <= MAX_RADIUS; radius++) {
            const cells = gridDisk(order.h3Index, radius);

            // 4️ Fetch engineers (alive + online)
            const engineers = await Engineer.find({
                h3Index: { $in: cells },
                status: "ONLINE",
                isActive: true,
                isBlocked: false,
                isSuspended: false,
                lastHeartbeat: {
                    $gte: new Date(Date.now() - HEARTBEAT_TIMEOUT)
                }
            }).select("_id rating h3Index");

            if (!engineers.length) continue;

            // 5️ Batch availability check (NO N+1)
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

            // 6️ Ranking (rating for now)
            availableEngineers.sort((a, b) => b.rating - a.rating);

            selectedEngineers = availableEngineers.slice(0, MAX_ENGINEERS);

            console.log(
                `Found ${selectedEngineers.length} engineers at radius ${radius}`
            );

            break; //  STOP when found
        }

        if (!selectedEngineers.length) {
            console.log(" No engineers found after max radius");

            //  Optional retry (production: use queue like BullMQ)
            setTimeout(() => {
                dispatchOrder(orderId);
            }, 10000);

            return;
        }

        // 7️ Send order request
        for (let eng of selectedEngineers) {
            await sendOrderRequest(eng, order);
        }

        return selectedEngineers;

    } catch (error) {
        console.error("Dispatch Error:", error);
        throw error;
    }
};