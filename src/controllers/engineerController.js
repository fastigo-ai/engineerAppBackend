import { Engineer } from '../models/engineersModal.js';
import { Order } from '../models/orderSchema.js';


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

export  const AssignEngineerToOrderController = async (req, res) => {
    try {
        const { id } = req.params;
        const { engineerId } = req.body;
        const engineer = await Order.findByIdAndUpdate(id, { assignedEngineer: engineerId }, { new: true });
        await Engineer.findByIdAndUpdate(engineerId,  { isAvailable: false  , assignedOrders: [id] }, { new: true });
        res.status(200).json(engineer);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

 export const unAssignEngineerFromOrderController = async (req, res) => {
    try {
        const { id } = req.params;
        const assignedEngineer = await Order.findById(id).populate('assignedEngineer');
        const engineer = await Order.findByIdAndUpdate(id, { assignedEngineer: null }, { new: true });
        
        await Engineer.findByIdAndUpdate(assignedEngineer._id, { isAvailable: true  , assignedOrders: [] }, { new: true });
        res.status(200).json(engineer);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};