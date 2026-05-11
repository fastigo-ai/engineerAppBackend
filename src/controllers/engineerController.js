import { Engineer } from '../models/engineersModal.js';
import { Order } from '../models/orderSchema.js';
import { getEngineerStatsService, goOnlineService, goOfflineService, heartbeatService, updateLocationService } from '../services/engineerService.js';


export const addengineerController = async (req, res) => {
    try {
        const { name, email, phone, skills } = req.body;
        const engineer = new Engineer({ name, email, phone, skills });
        await engineer.save();
        res.status(201).json(engineer);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getEngineersController = async (req, res) => {
    try {
        const engineers = await Engineer.find();
        res.status(200).json(engineers);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
export const getAvialbleEngineersController = async (req, res) => {
    try {
        const engineers = await Engineer.find({ isAvailable: true });
        res.status(200).json(engineers);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const updateEngineerController = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, skills } = req.body;
        const engineer = await Engineer.findByIdAndUpdate(id, { name, email, phone, skills }, { new: true });
        res.status(200).json(engineer);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Optimized GET all engineers for Admin Dashboard
 * Supports: Search (name, phone, email), Status Filter, and Pagination
 */
export const getEngineersAdminController = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            search = '', 
            status = 'all' 
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const limitNum = parseInt(limit);

        const match = {};

        // 1. Search (Name, Phone, Email)
        if (search) {
            match.$or = [
                { name: { $regex: search, $options: 'i' } },
                { mobile: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        // 2. Status Filter (ONLINE, OFFLINE, BUSY)
        if (status && status !== 'all') {
            match.status = status.toUpperCase();
        }

        // Execute Aggregation
        const [results] = await Engineer.aggregate([
            { $match: match },
            {
                $facet: {
                    metadata: [{ $count: "total" }],
                    stats: [
                        {
                            $group: {
                                _id: null,
                                totalEngineers: { $sum: 1 },
                                onlineCount: { $sum: { $cond: [{ $eq: ["$status", "ONLINE"] }, 1, 0] } },
                                busyCount: { $sum: { $cond: [{ $eq: ["$status", "BUSY"] }, 1, 0] } },
                                offlineCount: { $sum: { $cond: [{ $eq: ["$status", "OFFLINE"] }, 1, 0] } },
                                avgRating: { $avg: "$rating" }
                            }
                        }
                    ],
                    data: [
                        { $sort: { createdAt: -1 } },
                        { $skip: skip },
                        { $limit: limitNum }
                    ]
                }
            }
        ]);

        const totalCount = results.metadata[0]?.total || 0;
        const globalStats = results.stats[0] || {
            totalEngineers: 0,
            onlineCount: 0,
            busyCount: 0,
            offlineCount: 0,
            avgRating: 0
        };

        return res.status(200).json({
            success: true,
            message: 'Engineers retrieved successfully',
            data: results.data,
            stats: globalStats,
            pagination: {
                totalCount,
                totalPages: Math.ceil(totalCount / limitNum),
                currentPage: parseInt(page),
                limit: limitNum,
                hasMore: skip + results.data.length < totalCount
            }
        });

    } catch (error) {
        console.error('[EngineerController] Admin get engineers error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve engineers',
            error: error.message
        });
    }
};

/**
 * Admin: Toggle engineer block status (Block/Unblock)
 */
export const toggleEngineerBlockController = async (req, res) => {
    try {
        const { id } = req.params;
        const { isBlocked } = req.body;

        const engineer = await Engineer.findByIdAndUpdate(
            id, 
            { isBlocked }, 
            { new: true }
        );

        if (!engineer) {
            return res.status(404).json({ success: false, message: "Engineer not found" });
        }

        res.status(200).json({ 
            success: true, 
            message: `Engineer ${isBlocked ? 'blocked' : 'unblocked'} successfully`,
            data: engineer 
        });
    } catch (error) {
        console.error('Toggle block error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const AssignEngineerToOrderController = async (req, res) => {
    try {
        const { id } = req.params;
        const { engineerId } = req.body;

        // 1. Fetch order and check status
        const order = await Order.findById(id);
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        if (order.orderStatus === 'Cancelled' || order.status === 'cancelled') {
            return res.status(400).json({ 
                success: false, 
                message: "Cannot assign engineer to a cancelled order" 
            });
        }

        // 2. Perform assignment
        const updatedOrder = await Order.findByIdAndUpdate(id, { assignedEngineer: engineerId }, { new: true });
        await Engineer.findByIdAndUpdate(engineerId, { isAvailable: false, assignedOrders: [id] }, { new: true });
        
        res.status(200).json(updatedOrder);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

export const unAssignEngineerFromOrderController = async (req, res) => {
    try {
        const { id } = req.params;
        const assignedEngineer = await Order.findById(id).populate('assignedEngineer');
        const engineer = await Order.findByIdAndUpdate(id, { 
            assignedEngineer: null,
            acceptedBy: null,
            status: 'Searching',
            work_status: 'Searching',
            $push: {
                tracking: {
                    status: 'SEARCHING_DELAYED',
                    title: 'Partner Declined Visit',
                    subTitle: 'Finding a new expert for you',
                    timestamp: new Date()
                }
            }
        }, { new: true })
        .populate('userId')
        .populate('servicePlan servicePlans');

        await Engineer.findByIdAndUpdate(assignedEngineer._id, { isAvailable: true, assignedOrders: [] }, { new: true });

        // 🔔 Notify User and Redispatch
        if (engineer.userId) {
            try {
                const { notifyBookingUpdate } = await import("../services/notification/notificationService.js");
                const { notifyEngineersForOrder } = await import("../services/notificationEngineerService.js");

                // 1. Notify User (Uses template from registry)
                notifyBookingUpdate(engineer.userId._id, engineer._id, 'ENGINEER_DECLINED_REASSIGNING', {
                    serviceName: engineer.servicePlan?.name || 'Service'
                }).catch(err => console.error('Failed to notify user after unassignment:', err));

                // 2. Trigger Redispatch
                notifyEngineersForOrder(engineer);

            } catch (notifyError) {
                console.error('Failed to notify/redispatch after unassignment:', notifyError);
            }
        }

        res.status(200).json(engineer);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const getEngineerDashboard = async (req, res) => {
    try {
        const engineerId = req.user.id;

        const stats = await getEngineerStatsService(engineerId);

        return res.status(200).json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error("Dashboard Stats Error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch engineer statistics"
        });
    }
};

export const goOnlineController = async (req, res) => {
    try {
        const engineerId = req.user?.id;
        const { lat, lng } = req.body;

        const engineer = await goOnlineService({
            engineerId,
            lat,
            lng
        });

        return res.status(200).json({
            success: true,
            message: "Engineer is now ONLINE",
            data: engineer
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};


export const goOfflineController = async (req, res) => {
    try {
        const engineerId = req.user?.id;

        const engineer = await goOfflineService({
            engineerId
        });

        return res.status(200).json({
            success: true,
            message: "Engineer is now OFFLINE",
            data: engineer
        });
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

export const heartbeatController = async (req, res) => {
    try {
        const engineerId = req.user?.id;

        const result = await heartbeatService({ engineerId });

        return res.status(200).json(result);
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

export const updateLocationController = async (req, res) => {
    try {
        const engineerId = req.user?.id;
        const { lat, lng } = req.body;

        const result = await updateLocationService({
            engineerId,
            lat,
            lng
        });

        return res.status(200).json(result);
    } catch (error) {
        return res.status(400).json({
            success: false,
            message: error.message
        });
    }
};


