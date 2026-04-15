import express from 'express';
import { loginWithFirebase, updateName, getProfile, sendOTP, verifyOTP, resendOTP, uploadProfileImage, removeProfileImage } from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleWare.js';
import { registerDevice, unregisterDevice } from '../modules/notification/notification.controller.js';
import upload from '../middleware/multer.js';

const router = express.Router();


router.post("/login", loginWithFirebase);
router.get("/profile", authenticate, getProfile);
router.put("/updateName", authenticate, updateName);

// FCM Token management
router.post("/update-fcm-token", authenticate, registerDevice);
router.post("/remove-fcm-token", authenticate, unregisterDevice);

// OTP routes
router.post("/send-otp", sendOTP);
router.post("/verify-otp", verifyOTP);
router.post("/resend-otp", resendOTP);

// Profile image routes
router.post("/profile-image", authenticate, upload.single("profileImage"), uploadProfileImage);
router.delete("/profile-image", authenticate, removeProfileImage);


export default router;
