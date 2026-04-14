import express from 'express';
import { loginWithFirebase, updateName, sendOTP, verifyOTP, resendOTP } from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleWare.js';
import { registerDevice, unregisterDevice } from '../modules/notification/notification.controller.js';

const router = express.Router();


router.post("/login", loginWithFirebase);
router.put("/updateName", authenticate, updateName);

// FCM Token management
router.post("/update-fcm-token", authenticate, registerDevice);
router.post("/remove-fcm-token", authenticate, unregisterDevice);

// OTP routes
router.post("/send-otp", sendOTP);
router.post("/verify-otp", verifyOTP);
router.post("/resend-otp", resendOTP);


export default router;
