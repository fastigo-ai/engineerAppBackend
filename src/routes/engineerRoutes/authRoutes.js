import express from 'express';
import { login, register, onboardEngineer } from '../../controllers/engineerController/authController.js';
import { authenticateEngineer } from '../../middleware/authMiddleWare.js';
import { updateFcmToken, removeFcmToken } from '../../controllers/notificationController.js';

const router = express.Router();

router.post("/engineer/login", login);
router.post("/engineer/register", register);
router.post("/engineer/onboard", onboardEngineer);

// FCM Token management
router.post("/update-fcm-token", authenticateEngineer, updateFcmToken);
router.post("/remove-fcm-token", authenticateEngineer, removeFcmToken);

export default router;
