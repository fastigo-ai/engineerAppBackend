import express from 'express';
import {
  acceptRequest,
  rejectRequest,
  completeRequest,
  updateRequestStatus,
  getAcceptedRequests,
  getRejectedRequests,
  updateWorkStatus,
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
router.put("/requests/updateWorkStatus/:id", authenticateEngineer, updateWorkStatus);
router.get("/requests/completed", authenticateEngineer, getCompletedRequests);
router.get("/requests/details/:id", authenticateEngineer, getRequestDetails);
router.post("/requests/upload-photos/:id", upload.array("images", 10), authenticateEngineer, uploadOrderPhotos);
router.post("/requests/otp/send/:id", authenticateEngineer, sendCompletionOTP);
router.post("/requests/otp/verify/:id", authenticateEngineer, verifyCompletionOTP);
router.get("/requests/payment-qr/:id", authenticateEngineer, generatePaymentQRCode);
router.post("/requests/quick-reply", authenticateEngineer, sendQuickReply);

export default router;
