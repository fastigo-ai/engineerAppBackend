import { Router } from 'express';
import * as controller from './notification.controller.js';
import { authenticate } from '../../middleware/authMiddleWare.js';

const router = Router();

// Device Token Management
router.post('/device/register', authenticate, controller.registerDevice);
router.post('/device/unregister', authenticate, controller.unregisterDevice);

// Notification Inbox & Tracking
router.patch('/:id/opened', authenticate, controller.markOpened);
router.get('/history', authenticate, controller.getHistory);
router.get('/unread-count', authenticate, controller.getUnreadCount);

export default router;

