import express from 'express';
import { userAuthRoutes, engineerAuthRoutes, adminAuthRoutes } from './modules/auth/index.js';
import catalogRoutes from './modules/catalog/index.js';
import notificationRoutes from './modules/notification/api/notification.routes.js';
import paymentRoutes from './modules/finance/payments/payment.routes.js';
import mapRoutes from './modules/map/map.routes.js';
import engineerRoutes from './modules/engineer/index.js';
import adminRoutes from './routes/adminRoutes.js';
import couponRoutes from './modules/coupon/coupon.routes.js';

const app = express();

// Auth modules
app.use('/api/auth', userAuthRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/engineer/auth', engineerAuthRoutes);

// Catalog modules (mounted at /api/services)
app.use('/api/services', catalogRoutes);

// Notification module
app.use('/api/notification', notificationRoutes);

// Finance module
app.use('/api/payment', paymentRoutes);

// Map module
app.use('/api/map', mapRoutes);

// Engineer module
app.use('/api/engineer', engineerRoutes);

// Admin module
app.use('/api/admin', adminRoutes);

// Coupon module
app.use('/api/coupon', couponRoutes);

export default app;
