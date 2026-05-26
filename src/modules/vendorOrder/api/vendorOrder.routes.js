import express from 'express';
import {
  createVendorRequests,
  toggleVendorOrderHoldWebhook,
  redispatchVendorOrderWebhook,
  servicableLocation,
  acceptVendorOrder,
  rejectVendorOrder,
  getNearbyVendorOrders,
  updateVendorOrderWorkStatus,
  completeOrder,
  getAcceptedVendorOrders,
  getRejectedVendorOrders,
  getCompletedVendorOrders
} from './vendorOrder.controller.js';
import { authenticateEngineer } from '../../../middleware/authMiddleWare.js';
import { nearbyApiLimiter } from '../../../middleware/rateLimiter.js';
import upload from '../../../middleware/multer.js';

const router = express.Router();

router.post("/vendorOrder/request", createVendorRequests);
router.post("/vendorOrder/toggle-hold", toggleVendorOrderHoldWebhook);
router.post("/vendorOrder/redispatch", redispatchVendorOrderWebhook);
router.get("/vendorOrder/serviceable", servicableLocation);
router.post("/vendorOrder/accept", authenticateEngineer, acceptVendorOrder);
router.post("/vendorOrder/reject", authenticateEngineer, rejectVendorOrder);
router.get("/vendorOrder/nearby", authenticateEngineer, nearbyApiLimiter, getNearbyVendorOrders);
router.post("/vendorOrder/updateVendorOrderStatus/:orderId", authenticateEngineer, updateVendorOrderWorkStatus);
router.post("/vendorOrder/complete", upload.array("images", 20), authenticateEngineer, completeOrder);
router.get("/vendorOrder/accepted", authenticateEngineer, getAcceptedVendorOrders);
router.get("/vendorOrder/rejected", authenticateEngineer, getRejectedVendorOrders);
router.get("/vendorOrder/completed", authenticateEngineer, getCompletedVendorOrders);

export default router;
