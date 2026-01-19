import express from 'express';
import { loginWithFirebase, updateName, sendOTP, verifyOTP, resendOTP } from '../controllers/authController.js';
import { authenticate } from '../middleware/authMiddleWare.js';
const router = express.Router();


router.post("/login", loginWithFirebase);
router.put("/updateName", authenticate, updateName);

// OTP routes
router.post("/send-otp", sendOTP);
router.post("/verify-otp", verifyOTP);
router.post("/resend-otp", resendOTP);


export default router;
