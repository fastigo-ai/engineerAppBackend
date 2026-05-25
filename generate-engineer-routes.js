import fs from 'fs';

const oldRoutes = fs.readFileSync('src/routes/engineerRoutes.js', 'utf8');

const profileRoutes = `import express from 'express';
import {
  addengineerController,
  getEngineersController,
  getEngineersAdminController,
  toggleEngineerBlockController,
  getEngineerDossierController,
  getAvialbleEngineersController,
  updateEngineerController,
  AssignEngineerToOrderController,
  updateEngineerRadiusController,
  getEngineerDashboard,
  getProfile,
  updateProfile
} from './engineer.controller.js';
import { authenticate, authorize, authenticateEngineer } from '../../../middleware/authMiddleWare.js';

const router = express.Router();

router.post("/addEngineer", addengineerController);
router.get("/getEngineers", getEngineersController);
router.get("/admin/getEngineers", authenticate, authorize('admin', 'super_admin'), getEngineersAdminController);
router.put("/admin/toggleBlock/:id", authenticate, authorize('admin', 'super_admin'), toggleEngineerBlockController);
router.get("/admin/dossier/:id", authenticate, authorize('admin', 'super_admin'), getEngineerDossierController);
router.get("/getAvialbleEngineers", getAvialbleEngineersController);
router.put("/updateEngineer/:id", updateEngineerController);
router.put("/assignEngineerToOrder/:id", AssignEngineerToOrderController);
router.put("/updateRadius/:id", updateEngineerRadiusController);
router.get("/dashboard", authenticateEngineer, getEngineerDashboard);
router.get("/profile", authenticateEngineer, getProfile);
router.put("/profile/update", authenticateEngineer, updateProfile);

export default router;
`;

const locationRoutes = `import express from 'express';
import {
  updateEngineerLocation,
  goOnlineController,
  goOfflineController,
  heartbeatController,
  updateLocationController
} from '../profile/engineer.controller.js'; // These methods are currently inside engineer.controller.js
import { getNearbyRequests, getNearbyOrdersController } from './nearby.controller.js';
import { authenticateEngineer } from '../../../middleware/authMiddleWare.js';
import nearbyApiLimiter from '../../../middleware/rateLimit.js';

const router = express.Router();

router.put("/updateLocation", authenticateEngineer, updateEngineerLocation);
router.put("/goOnline", authenticateEngineer, goOnlineController);
router.put("/goOffline", authenticateEngineer, goOfflineController);
router.post("/heartbeat", authenticateEngineer, heartbeatController);
router.post("/update/location", authenticateEngineer, updateLocationController);

router.get("/requests/nearby", authenticateEngineer, nearbyApiLimiter, getNearbyRequests);
router.get("/requests/fetching-nearby", authenticateEngineer, nearbyApiLimiter, getNearbyOrdersController);

export default router;
`;

const requestsRoutes = `import express from 'express';
import {
  acceptRequest,
  rejectRequest,
  completeRequest,
  updateRequestStatus,
  getAcceptedRequests,
  getRejectedRequests,
  updateRescheduleStatusController,
  getCompletedRequests,
  getRequestDetails,
  uploadOrderPhotos,
  sendCompletionOTP,
  verifyCompletionOTP,
  generatePaymentQRCode,
  sendQuickReply
} from './request.controller.js';
import { authenticateEngineer } from '../../../middleware/authMiddleWare.js';
import upload from '../../../middleware/multer.js';

const router = express.Router();

router.put("/requests/accept/:id", authenticateEngineer, acceptRequest);
router.put("/requests/reject/:id", authenticateEngineer, rejectRequest);
router.put("/requests/complete/:id", authenticateEngineer, completeRequest);
router.put("/requests/status/:id", authenticateEngineer, updateRequestStatus);
router.get("/requests/accepted", authenticateEngineer, getAcceptedRequests);
router.get("/requests/rejected", authenticateEngineer, getRejectedRequests);
router.put("/requests/updateRescheduleStatus/:id", authenticateEngineer, updateRescheduleStatusController);
router.get("/requests/completed", authenticateEngineer, getCompletedRequests);
router.get("/requests/details/:id", authenticateEngineer, getRequestDetails);
router.post("/requests/upload-photos/:id", upload.array("images", 10), authenticateEngineer, uploadOrderPhotos);
router.post("/requests/otp/send/:id", authenticateEngineer, sendCompletionOTP);
router.post("/requests/otp/verify/:id", authenticateEngineer, verifyCompletionOTP);
router.get("/requests/payment-qr/:id", authenticateEngineer, generatePaymentQRCode);
router.post("/requests/quick-reply", authenticateEngineer, sendQuickReply);

export default router;
`;

const vendorRequestsRoutes = `import express from 'express';
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
} from './vendor-request.controller.js';
import { authenticateEngineer } from '../../../middleware/authMiddleWare.js';
import nearbyApiLimiter from '../../../middleware/rateLimit.js';
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
`;

const financeRoutes = `import express from 'express';
import {
  getWalletBalance,
  requestWithdrawal,
  getTransactionHistory,
  getBankAccount,
  getEngineerEarnings
} from './finance.controller.js'; // Note getEngineerEarnings might be in engineer.controller.js, but fits finance
import { authenticateEngineer } from '../../../middleware/authMiddleWare.js';
import walletLimiter from '../../../middleware/rateLimit.js';

const router = express.Router();

router.get("/earnings", authenticateEngineer, getEngineerEarnings);
router.get("/wallet", authenticateEngineer, getWalletBalance);
router.post("/withdraw", authenticateEngineer, walletLimiter, requestWithdrawal);
router.get("/transactions", authenticateEngineer, getTransactionHistory);
router.get("/bank-account", authenticateEngineer, getBankAccount);

export default router;
`;

const indexRoute = `import express from 'express';
import profileRoutes from './profile/profile.routes.js';
import locationRoutes from './location/location.routes.js';
import requestsRoutes from './requests/requests.routes.js';
import vendorRequestsRoutes from './vendor-requests/vendor-requests.routes.js';
import financeRoutes from './finance/finance.routes.js';

const router = express.Router();

router.use('/', profileRoutes);
router.use('/', locationRoutes);
router.use('/', requestsRoutes);
router.use('/', vendorRequestsRoutes);
router.use('/', financeRoutes);

export default router;
`;

fs.writeFileSync('src/modules/engineer/profile/profile.routes.js', profileRoutes);
fs.writeFileSync('src/modules/engineer/location/location.routes.js', locationRoutes);
fs.writeFileSync('src/modules/engineer/requests/requests.routes.js', requestsRoutes);
fs.writeFileSync('src/modules/engineer/vendor-requests/vendor-requests.routes.js', vendorRequestsRoutes);
fs.writeFileSync('src/modules/engineer/finance/finance.routes.js', financeRoutes);
fs.writeFileSync('src/modules/engineer/index.js', indexRoute);

console.log("Routes generated successfully!");
