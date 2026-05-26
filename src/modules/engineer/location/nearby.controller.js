import { Engineer } from "../../auth/engineer/engineer.model.js";
import { getNearbyOrdersService } from '../requests/nearby.service.js';
import STATUS_CODES from "../../../constants/statusCodes.js";

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
    const page = req.query.page || 1;
    const limit = req.query.limit || 15;
    
    const result = await getNearbyOrdersService({ engineer, type, page, limit });

    return res.status(STATUS_CODES.SUCCESS || 200).json({
      success: true,
      count: result.orders.length,
      totalCount: result.totalCount,
      currentPage: result.currentPage,
      totalPages: result.totalPages,
      hasMore: result.hasMore,
      message: result.orders.length ? "Nearby orders fetched successfully." : "No orders found in your area.",
      data: result.orders
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
