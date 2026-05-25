import express from 'express';
import {
  createServicePlanType,
  getPlanTypes
} from './plan.controller.js';
import { authenticate, authorize } from '../../../../middleware/authMiddleWare.js';

const router = express.Router();

router.post('/createServicePlanType', authenticate, authorize('admin', 'super_admin'), createServicePlanType);
router.get('/planTypes', getPlanTypes);

export default router;
