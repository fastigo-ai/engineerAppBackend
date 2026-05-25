import STATUS_CODES from '../../../constants/statusCodes.js';
import { ServicePlans } from './plan.model.js';

export const createServicePlanType = async (req, res) => {
  try {
    const { planType } = req.body;

    if (!planType) {
      return res.status(400).json({ message: "Plan type is required" });
    }

    const validTypes = ["Booking", "Quick"];
    if (!validTypes.includes(planType)) {
      return res.status(400).json({
        message: "Invalid plan type. Use 'Booking' or 'Quick'."
      });
    }

    const existing = await ServicePlans.findOne({ planType });
    if (existing) {
      return res.status(400).json({ message: "Plan type already exists" });
    }

    const newPlanType = await ServicePlans.create({ planType });

    return res.status(201).json({
      message: "Service plan type created successfully",
      data: newPlanType,
    });
  } catch (error) {
    console.error("Error creating service plan type:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message
    });
  }
};

export const getPlanTypes = async (req, res) => {
  try {
    const planTypes = await ServicePlans.find();
    res.status(200).json({ success: true, data: planTypes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
