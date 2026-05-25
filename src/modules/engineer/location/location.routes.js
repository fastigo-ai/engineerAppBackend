import express from 'express';
import {
  goOnlineController,
  goOfflineController,
  heartbeatController,
  updateLocationController
} from '../profile/engineer.controller.js'; // These methods are currently inside engineer.controller.js
import { getNearbyOrdersController } from './nearby.controller.js';
import { getNearbyRequests, updateEngineerLocation } from '../requests/request.controller.js';
import { authenticateEngineer } from '../../../middleware/authMiddleWare.js';
import { nearbyApiLimiter } from '../../../middleware/rateLimiter.js';

const router = express.Router();

router.put("/updateLocation", authenticateEngineer, updateEngineerLocation);
router.put("/goOnline", authenticateEngineer, goOnlineController);
router.put("/goOffline", authenticateEngineer, goOfflineController);
router.post("/heartbeat", authenticateEngineer, heartbeatController);
router.post("/update/location", authenticateEngineer, updateLocationController);

router.get("/requests/nearby", authenticateEngineer, nearbyApiLimiter, getNearbyRequests);
router.get("/requests/fetching-nearby", authenticateEngineer, nearbyApiLimiter, getNearbyOrdersController);

export default router;
