import express from 'express';
import {
  loginWithFirebase,
  updateName,
  getProfile,
  sendOTP,
  verifyOTP,
  resendOTP,
  uploadProfileImage,
  removeProfileImage,
  getCustomersAdminController
} from './user.controller.js';
import { authenticate, authorize } from '../../../middleware/authMiddleWare.js';
import { registerDevice, unregisterDevice } from '../../notification/notification.controller.js';
import upload from '../../../middleware/multer.js';
import { authLimiter } from '../../../middleware/rateLimiter.js';

const router = express.Router();

router.post("/login", authLimiter, loginWithFirebase);
router.get("/profile", authenticate, getProfile);
router.put("/updateName", authenticate, updateName);

// FCM Token management
router.post("/update-fcm-token", authenticate, registerDevice);
router.post("/remove-fcm-token", authenticate, unregisterDevice);

// OTP routes
router.post("/send-otp", authLimiter, sendOTP);
router.post("/verify-otp", authLimiter, verifyOTP);
router.post("/resend-otp", authLimiter, resendOTP);

// Profile image routes
router.post("/profile-image", authenticate, upload.single("profileImage"), uploadProfileImage);
router.delete("/profile-image", authenticate, removeProfileImage);

// Admin routes
router.get("/admin/allCustomers", authenticate, authorize('admin', 'super_admin'), getCustomersAdminController);

export default router;
