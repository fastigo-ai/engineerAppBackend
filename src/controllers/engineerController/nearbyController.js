import { Engineer } from "../../models/engineersModal.js";
import { getNearbyOrdersService } from "../../services/nearbyService.js";
import STATUS_CODES from "../../constants/statusCodes.js";

/**
 * Controller to fetch nearby orders based on the engineer's H3 index.
 * Only fetches orders that are 'Searching', unassigned, and meet time requirements.
 * Engineer MUST be ONLINE to access this list.
 */
export const getNearbyOrdersController = async (req, res) => {
  try {
    const engineerId = req.user.id; // From authenticateEngineer middleware

    // 1. Fetch engineer profile to check status and H3 index
    const engineer = await Engineer.findById(engineerId)
      .select("h3Index status name location")
      .lean();

    if (!engineer) {
      return res.status(STATUS_CODES.NOT_FOUND || 404).json({
        success: false,
        message: "Engineer not found"
      });
    }

    // 2. Strict enforcement: Engineer must be online to fetch nearby orders
    if (engineer.status !== "ONLINE") {
      return res.status(STATUS_CODES.SUCCESS || 200).json({
        success: true,
        isOffline: true, // Key flag for frontend
        message: "You must be ONLINE to fetch nearby orders.",
        data: []
      });
    }

    // 3. Call the service to find nearby matches using H3 radius expansion
    const type = req.query.type || "all";
    const orders = await getNearbyOrdersService({ engineer, type });

    return res.status(STATUS_CODES.SUCCESS || 200).json({
      success: true,
      count: orders.length,
      message: orders.length ? "Nearby orders fetched successfully." : "No orders found in your area.",
      data: orders
    });

  } catch (error) {
    console.error("Nearby orders fetching error:", error);

    return res.status(STATUS_CODES.INTERNAL_SERVER_ERROR || 500).json({
      success: false,
      message: "Failed to fetch nearby orders. Please try again later.",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
