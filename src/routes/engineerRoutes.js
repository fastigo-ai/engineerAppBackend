import express from "express";
import {
  addengineerController,
  getEngineersController,
  getAvialbleEngineersController,
  updateEngineerController,
  AssignEngineerToOrderController,
  unAssignEngineerFromOrderController,
  getEngineerDashboard,
  goOnlineController,
  goOfflineController,
  heartbeatController,
  updateLocationController,
} from "../controllers/engineerController.js";
import {
  getProfile,
  updateProfile
} from "../controllers/engineerController/authController.js";
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
  sendCompletionOTP,
  verifyCompletionOTP,
  generatePaymentQRCode,
  uploadOrderPhotos,
  getRequestDetails,
} from "../controllers/engineerController/requestController.js";
import { getNearbyOrdersController } from "../controllers/engineerController/nearbyController.js";
import { 
  getWalletBalance, 
  requestWithdrawal, 
  getTransactionHistory,
  getBankAccount
} from "../controllers/engineerController/walletController.js";

import {
  servicableLocation,
  acceptVendorOrder,
  getNearbyVendorOrders,
  rejectVendorOrder,
  updateVendorOrderWorkStatus,
  completeOrder,
  getAcceptedVendorOrders,
  getRejectedVendorOrders,
  getCompletedVendorOrders,
  createVendorRequests,
} from "../controllers/engineerController/venderRequestController.js";
import {
  authenticate,
  authenticateEngineer,
} from "../middleware/authMiddleWare.js";
import upload from "../middleware/multer.js";

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
router.put("/goOnline", authenticateEngineer, goOnlineController);
router.put("/goOffline", authenticateEngineer, goOfflineController);
router.post("/heartbeat", authenticateEngineer, heartbeatController);
router.post("/update/location", authenticateEngineer, updateLocationController);
router.get("/requests/nearby", authenticateEngineer, getNearbyRequests);
router.get("/requests/fetching-nearby", authenticateEngineer, getNearbyOrdersController);

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
router.get("/requests/details/:id", authenticateEngineer, getRequestDetails);

// OTP verification for job completion
router.post("/requests/upload-photos/:id", upload.array("images", 10), authenticateEngineer, uploadOrderPhotos);
router.post("/requests/otp/send/:id", authenticateEngineer, sendCompletionOTP);
router.post("/requests/otp/verify/:id", authenticateEngineer, verifyCompletionOTP);
router.get("/requests/payment-qr/:id", authenticateEngineer, generatePaymentQRCode);

// Vender-specific routes can be added here

router.post("/vendorOrder/request", createVendorRequests);
router.get("/vendorOrder/serviceable", servicableLocation);
router.post("/vendorOrder/accept", authenticateEngineer, acceptVendorOrder);
router.post("/vendorOrder/reject", authenticateEngineer, rejectVendorOrder);
router.get("/vendorOrder/nearby", authenticateEngineer, getNearbyVendorOrders);
router.post("/vendorOrder/updateVendorOrderStatus/:orderId", authenticateEngineer, updateVendorOrderWorkStatus);

router.post("/vendorOrder/complete", upload.array("images", 20), authenticateEngineer, completeOrder);

router.get("/vendorOrder/accepted", authenticateEngineer, getAcceptedVendorOrders);
router.get("/vendorOrder/rejected", authenticateEngineer, getRejectedVendorOrders);
router.get("/vendorOrder/completed", authenticateEngineer, getCompletedVendorOrders);



router.get("/dashboard", authenticateEngineer, getEngineerDashboard);

// Profile routes
router.get("/profile", authenticateEngineer, getProfile);
router.put("/profile/update", authenticateEngineer, updateProfile);

// Wallet & Withdrawal routes
router.get("/wallet", authenticateEngineer, getWalletBalance);
router.post("/withdraw", authenticateEngineer, requestWithdrawal);
router.get("/transactions", authenticateEngineer, getTransactionHistory);
router.get("/bank-account", authenticateEngineer, getBankAccount);

export default router;
