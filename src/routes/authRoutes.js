import express from 'express';
import { loginWithFirebase, updateName, sendOTP, verifyOTP, resendOTP } from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleWare.js';
import { updateFcmToken, removeFcmToken } from '../controllers/notificationController.js';

const router = express.Router();


router.post("/login", loginWithFirebase);
router.put("/updateName", authenticate, updateName);

// FCM Token management
router.post("/update-fcm-token", authenticate, updateFcmToken);
router.post("/remove-fcm-token", authenticate, removeFcmToken);

// OTP routes
router.post("/send-otp", sendOTP);
router.post("/verify-otp", verifyOTP);
router.post("/resend-otp", resendOTP);


export default router;
