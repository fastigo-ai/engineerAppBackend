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

export const AssignEngineerToOrderController = async (req, res) => {
    try {
        const { id } = req.params;
        const { engineerId } = req.body;
        const engineer = await Order.findByIdAndUpdate(id, { assignedEngineer: engineerId }, { new: true });
        await Engineer.findByIdAndUpdate(engineerId, { isAvailable: false, assignedOrders: [id] }, { new: true });
        res.status(200).json(engineer);
    } catch (error) {
        res.status(500).json({ message: error.message });
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
            work_status: 'Searching'
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


