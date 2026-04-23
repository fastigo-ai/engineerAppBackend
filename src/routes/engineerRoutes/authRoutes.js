import express from 'express';
import { login, register, onboardEngineer } from '../../controllers/engineerController/authController.js';
import { authenticateEngineer } from '../../middleware/authMiddleWare.js';
import { 
  registerDevice, 
  unregisterDevice,
  getHistory,
  getUnreadCount,
  markOpened,
  deleteNotification,
  clearAllNotifications
} from '../../modules/notification/notification.controller.js';

const router = express.Router();

router.post("/engineer/login", login);
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
