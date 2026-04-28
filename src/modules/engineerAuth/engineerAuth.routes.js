import express from 'express';
import { 
  sendOTP, 
  verifyOTP, 
  register, 
  onboardEngineer 
} from './engineerAuth.controller.js';
import { authenticateEngineer } from '../../middleware/authMiddleWare.js';
import { 
  registerDevice, 
  unregisterDevice,
  getHistory,
  getUnreadCount,
  markOpened,
  deleteNotification,
  clearAllNotifications
} from '../notification/notification.controller.js';

const router = express.Router();

// Engineer Auth endpoints
router.post("/engineer/send-otp", sendOTP);
router.post("/engineer/verify-otp", verifyOTP);
router.post("/engineer/register", register);
router.post("/engineer/onboard", onboardEngineer);

// FCM Token management
router.post("/update-fcm-token", authenticateEngineer, registerDevice);
router.post("/remove-fcm-token", authenticateEngineer, unregisterDevice);

// Notification Management
router.get("/notifications/history", authenticateEngineer, getHistory);
router.get("/notifications/unread-count", authenticateEngineer, getUnreadCount);
router.put("/notifications/mark-opened/:id", authenticateEngineer, markOpened);
router.delete("/notifications/clear-all", authenticateEngineer, clearAllNotifications);
router.delete("/notifications/:id", authenticateEngineer, deleteNotification);

export default router;
