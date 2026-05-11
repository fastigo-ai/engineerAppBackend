import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import config from './config/config.js';
import { initSocket } from './config/socket.js';
import { createServer } from 'http';
import logger from './middleware/logger.js';
import serviceRoutes from './routes/serviceRoutes.js';
import authRoutes from './modules/userAuth/userAuth.routes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import engineerRoutes from './routes/engineerRoutes.js';
import connectDB from './config/db.js';
import { isFirebaseConnected } from './config/firebase.js';
import engineerAuthRoutes from './modules/engineerAuth/engineerAuth.routes.js';
import mapRoutes from './routes/mapRoutes.js';
import errorHandler from './middleware/errorHandler.js';
import { handleRazorpayWebhook as handlePaymentWebhook } from './controllers/paymentController.js';
import { initPayoutCron } from './utils/payoutCron.js';
import couponRoutes from './modules/coupon/coupon.routes.js';
import { initCouponCron } from './modules/coupon/coupon.cron.js';
import adminRoutes from './routes/adminRoutes.js';
import adminAuthRoutes from './modules/adminAuth/adminAuth.routes.js';
import notificationRoutes from './modules/notification/notification.routes.js';
import { startNotificationWorker } from './modules/notification/notification.worker.js';
import { startAllNotificationCrons } from './modules/notification/notification.cron.js';
import { initStaleOrderJob } from './jobs/staleOrderJob.js';

// Load environment variables

// Initialize Express app
const app = express();
const httpServer = createServer(app);
initSocket(httpServer);

// 1. Razorpay Webhook (Needs raw body for signature verification)
// Must be defined BEFORE express.json()
app.post('/api/webhook/razorpay/payment', express.text({ type: 'application/json' }), handlePaymentWebhook);

// Middleware
app.use(helmet());
// app.use(cors({ origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*', credentials: true }));
app.use(cors({ 
  origin: (origin, callback) => callback(null, true), // Dynamically allows any origin
  credentials: true 
}));
app.use(cookieParser());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(logger);
app.use((req, res, next) => {
  res.setTimeout(300000, () => {
    console.log(`!!! [TIMEOUT] Request to ${req.url} timed out after 5 minutes`);
    res.status(408).json({ success: false, error: 'Request Timeout' });
  });
  next();
});

// Check Firebase connection
console.log('Firebase connected:', isFirebaseConnected);

// Default route (root)
app.get('/', (req, res) => {
  res.send('Door2fy Backend is running successfully!');
});

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    firebaseConnected: isFirebaseConnected,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// API routes
app.use('/api/services', serviceRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/engineer', engineerRoutes);
app.use('/api/coupon', couponRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notification', notificationRoutes);

// Engineer auth routes
app.use('/api/engineer/auth', engineerAuthRoutes);


// Catch 404 and return JSON
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      error: `API endpoint not found: ${req.method} ${req.originalUrl}`
    });
  }
  next();
});

// Error handling middleware
app.use(errorHandler);

// Start server
const startServer = async () => {
  try {
    // Connect to database
    await connectDB();

    // Initialize Cron Jobs
    // initPayoutCron();
    initCouponCron();

    // Start Notification Worker & Crons
    startNotificationWorker();
    startAllNotificationCrons();
    initStaleOrderJob();

    const PORT = process.env.PORT || config.port || 8080;
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
};

startServer();
