import express from 'express';
import { login, register, onboardEngineer } from '../../controllers/engineerController/authController.js';
import { authenticateEngineer } from '../../middleware/authMiddleWare.js';
import { registerDevice, unregisterDevice } from '../../modules/notification/notification.controller.js';

const router = express.Router();

router.post("/engineer/login", login);
router.post("/engineer/register", register);
router.post("/engineer/onboard", onboardEngineer);

// FCM Token management
router.post("/update-fcm-token", authenticateEngineer, registerDevice);
router.post("/remove-fcm-token", authenticateEngineer, unregisterDevice);

export default router;
