import express from 'express';
import userAuthRoutes from './modules/auth/user/user.routes.js';
import engineerAuthRoutes from './modules/auth/engineer/engineer.routes.js';
import adminAuthRoutes from './modules/auth/admin/admin.routes.js';

import categoryRoutes from './modules/catalog/category/category.routes.js';
import planRoutes from './modules/catalog/plan/plan.routes.js';
import serviceRoutes from './modules/catalog/service/service.routes.js';

import notificationRoutes from './modules/notification/api/notification.routes.js';
import paymentRoutes from './modules/finance/payments/payment.routes.js';
import mapRoutes from './modules/map/map.routes.js';
import engineerRoutes from './modules/engineer/index.js';
import adminRoutes from './modules/admin/api/admin.routes.js';
import couponRoutes from './modules/coupon/coupon.routes.js';

const app = express();

// Auth modules
app.use('/api/auth', userAuthRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/engineer/auth', engineerAuthRoutes);

// Catalog modules (mounted directly like index does)
app.use('/api/services', categoryRoutes);
app.use('/api/services', planRoutes);
app.use('/api/services', serviceRoutes);

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
