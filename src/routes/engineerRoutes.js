import express from "express";
import {
  addengineerController,
  getEngineersController,
  getAvialbleEngineersController,
  updateEngineerController,
  AssignEngineerToOrderController,
  unAssignEngineerFromOrderController,
} from "../controllers/engineerController.js";
import {
  updateEngineerLocation,
  getNearbyRequests,
  updateRequestStatus,
  acceptRequest,
  rejectRequest,
  completeRequest,
  getAcceptedRequests,
  getRejectedRequests,
  updateWorkStatus,
  getCompletedRequests,
} from "../controllers/engineerController/requestController.js";

import {
    getVendorRequests,
    servicableLocation,
} from "../controllers/engineerController/venderRequestController.js";
import {
  authenticate,
  authenticateEngineer,
} from "../middleware/authMiddleWare.js";

const router = express.Router();

router.post("/addEngineer", addengineerController);
router.get("/getEngineers", getEngineersController);
router.get("/getAvialbleEngineers", getAvialbleEngineersController);
router.put("/updateEngineer/:id", updateEngineerController);
router.put("/assignEngineerToOrder/:id", AssignEngineerToOrderController);
router.put(
  "/unAssignEngineerFromOrder/:id",
  unAssignEngineerFromOrderController,
);

// Location based routes (Engineer-specific)
router.put("/updateLocation", authenticateEngineer, updateEngineerLocation);
router.get("/requests/nearby", authenticateEngineer, getNearbyRequests);

// Request status routes (Engineer-specific) - New dedicated endpoints
router.put("/requests/accept/:id", authenticateEngineer, acceptRequest);
router.put("/requests/reject/:id", authenticateEngineer, rejectRequest);
router.put("/requests/complete/:id", authenticateEngineer, completeRequest);

// Legacy route - kept for backward compatibility
router.put("/requests/status/:id", authenticateEngineer, updateRequestStatus);

// Request retrieval routes
router.get("/requests/accepted", authenticateEngineer, getAcceptedRequests);
router.get("/requests/rejected", authenticateEngineer, getRejectedRequests);
router.put(
  "/requests/updateWorkStatus/:id",
  authenticateEngineer,
  updateWorkStatus,
);
router.get("/requests/completed", authenticateEngineer, getCompletedRequests);

// Vender-specific routes can be added here

router.post("/vendorOrder/request", getVendorRequests);
router.get("/vendorOrder/serviceable", servicableLocation);

export default router;
