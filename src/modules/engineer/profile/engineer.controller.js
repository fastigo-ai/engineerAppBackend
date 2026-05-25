import mongoose from 'mongoose';
import { Engineer } from '../../auth/engineer/engineer.model.js';
import { Order } from '../../../models/orderSchema.js';
import { Wallet } from "../../finance/wallet/Wallet.model.js";
import VendorOrder from '../../../models/vendorOrderModal.js';
import { WithdrawalRequest } from "../../finance/wallet/WithdrawalRequest.model.js";
import { getEngineerStatsService, goOnlineService, goOfflineService, heartbeatService, updateLocationService } from "./engineer.service.js";


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
            status = 'all',
            isBlocked = 'all',
            isVerified = 'all'
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

        // 3. Blocked Filter
        if (isBlocked !== 'all') {
            match.isBlocked = isBlocked === 'true';
        }

        // 4. Verified Filter
        if (isVerified !== 'all') {
            match.isVerified = isVerified === 'true';
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

/**
 * Admin: Get complete Engineer Dossier (Detailed Stats)
 */
export const getEngineerDossierController = async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Fetch Engineer
        const engineer = await Engineer.findById(id).lean();
        if (!engineer) {
            return res.status(404).json({ success: false, message: "Engineer not found" });
        }

        // 2. Aggregate Stats Parallelly
        const [
            orderStats,
            vendorStats,
            walletInfo,
            withdrawalStats
        ] = await Promise.all([
            // Regular Order Stats
            Order.aggregate([
                { $match: { assignedEngineer: new mongoose.Types.ObjectId(id) } },
                {
                    $group: {
                        _id: null,
                        totalOrders: { $sum: 1 },
                        completedCount: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
                        ongoingCount: { $sum: { $cond: [{ $in: ["$status", ["paid", "Searching"]] }, 1, 0] } },
                        cancelledCount: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } }
                    }
                }
            ]),

            // Vendor Order Stats
            VendorOrder.aggregate([
                { $match: { assigned_engineer_id: new mongoose.Types.ObjectId(id) } },
                {
                    $group: {
                        _id: null,
                        totalVendorOrders: { $sum: 1 },
                        completedVendorCount: { $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] } },
                        ongoingVendorCount: { $sum: { $cond: [{ $in: ["$status", ["ACCEPTED"]] }, 1, 0] } }
                    }
                }
            ]),

            // Wallet Info
            Wallet.findOne({ engineerId: id }).lean(),

            // Withdrawal Requests
            WithdrawalRequest.aggregate([
                { $match: { engineerId: new mongoose.Types.ObjectId(id) } },
                {
                    $group: {
                        _id: null,
                        totalWithdrawals: { $sum: 1 },
                        pendingWithdrawalAmount: { 
                            $sum: { 
                                $cond: [{ $in: ["$status", ["requested", "pending", "processing"]] }, "$amount", 0] 
                            } 
                        },
                        successWithdrawalAmount: { 
                            $sum: { 
                                $cond: [{ $eq: ["$status", "success"] }, "$amount", 0] 
                            } 
                        }
                    }
                }
            ])
        ]);

        const stats = {
            regularOrders: orderStats[0] || { totalOrders: 0, completedCount: 0, ongoingCount: 0, cancelledCount: 0 },
            vendorOrders: vendorStats[0] || { totalVendorOrders: 0, completedVendorCount: 0, ongoingVendorCount: 0 },
            wallet: walletInfo || { availableBalance: 0, lockedBalance: 0, withdrawnAmount: 0 },
            withdrawals: withdrawalStats[0] || { totalWithdrawals: 0, pendingWithdrawalAmount: 0, successWithdrawalAmount: 0 }
        };

        res.status(200).json({
            success: true,
            data: {
                profile: engineer,
                stats
            }
        });

    } catch (error) {
        console.error('Engineer dossier error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const AssignEngineerToOrderController = async (req, res) => {
    try {
        const { id } = req.params;
        const { engineerId } = req.body;

        // Try Order first
        let order = await Order.findById(id);
        let isVendor = false;

        if (!order) {
            order = await VendorOrder.findById(id);
            isVendor = true;
        }

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        const currentStatus = isVendor ? order.status : order.orderStatus;
        if (currentStatus === 'Cancelled' || currentStatus === 'CANCELLED') {
            return res.status(400).json({ 
                success: false, 
                message: "Cannot assign engineer to a cancelled order" 
            });
        }

        // Perform assignment
        let updatedOrder;
        if (isVendor) {
            updatedOrder = await VendorOrder.findByIdAndUpdate(id, { 
                assigned_engineer_id: engineerId,
                status: 'ACCEPTED',
                work_status: 'NOT_STARTED'
            }, { new: true });
        } else {
            updatedOrder = await Order.findByIdAndUpdate(id, { assignedEngineer: engineerId }, { new: true });
        }

        await Engineer.findByIdAndUpdate(engineerId, { isAvailable: false, assignedOrders: [id] }, { new: true });
        
        res.status(200).json(updatedOrder);
    } catch (error) {
        console.error('Assign engineer error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

export const unAssignEngineerFromOrderController = async (req, res) => {
    try {
        const { id } = req.params;

        // Try Order first
        let order = await Order.findById(id).populate('assignedEngineer');
        let isVendor = false;

        if (!order) {
            order = await VendorOrder.findById(id).populate('assigned_engineer_id');
            isVendor = true;
        }

        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        const assignedEngineerId = isVendor ? order.assigned_engineer_id?._id : order.assignedEngineer?._id;

        let updatedOrder;
        if (isVendor) {
            updatedOrder = await VendorOrder.findByIdAndUpdate(id, { 
                assigned_engineer_id: null,
                status: 'PENDING',
                work_status: 'NOT_STARTED'
            }, { new: true });
        } else {
            updatedOrder = await Order.findByIdAndUpdate(id, { 
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

            // 🔔 Notify User and Redispatch (Only for regular orders)
            if (updatedOrder.userId) {
                try {
                    const { notifyBookingUpdate } = await import("../../notification/core/notification.facade.js");
                    const { notifyEngineersForOrder } = await import("../../../services/notificationEngineerService.js");

                    notifyBookingUpdate(updatedOrder.userId._id, updatedOrder._id, 'ENGINEER_DECLINED_REASSIGNING', {
                        serviceName: updatedOrder.servicePlan?.name || 'Service'
                    }).catch(err => console.error('Failed to notify user after unassignment:', err));

                    notifyEngineersForOrder(updatedOrder);

                } catch (notifyError) {
                    console.error('Failed to notify/redispatch after unassignment:', notifyError);
                }
            }
        }

        if (assignedEngineerId) {
            await Engineer.findByIdAndUpdate(assignedEngineerId, { isAvailable: true, assignedOrders: [] }, { new: true });
        }

        res.status(200).json(updatedOrder);
    } catch (error) {
        console.error('Unassign engineer error:', error);
        res.status(500).json({ success: false, message: error.message });
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


