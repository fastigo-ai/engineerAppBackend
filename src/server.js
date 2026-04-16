import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import config from './config/config.js';
import { initSocket } from './config/socket.js';
import { createServer } from 'http';
import logger from './middleware/logger.js';
import serviceRoutes from './routes/serviceRoutes.js';
import authRoutes from './routes/authRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import engineerRoutes from './routes/engineerRoutes.js';
import connectDB from './config/db.js';
import { isFirebaseConnected } from './config/firebase.js';
import engineerAuthRoutes from './routes/engineerRoutes/authRoutes.js';
import mapRoutes from './routes/mapRoutes.js';
import errorHandler from './middleware/errorHandler.js';
import { handleRazorpayWebhook } from './controllers/razorpayWebhookController.js';
import { initPayoutCron } from './utils/payoutCron.js';
import couponRoutes from './modules/coupon/coupon.routes.js';
import { initCouponCron } from './modules/coupon/coupon.cron.js';
import adminRoutes from './routes/adminRoutes.js';
import notificationRoutes from './modules/notification/notification.routes.js';
import { startNotificationWorker } from './modules/notification/notification.worker.js';
import { startAllNotificationCrons } from './modules/notification/notification.cron.js';
import { initStaleOrderJob } from './jobs/staleOrderJob.js';

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const httpServer = createServer(app);
initSocket(httpServer);

// 1. Razorpay Webhook (Needs raw body for signature verification)
// Must be defined BEFORE express.json()
app.post('/api/webhook/razorpay', express.text({ type: 'application/json' }), handleRazorpayWebhook);

// Middleware
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*', credentials: true }));
app.use(express.json());
app.use(logger);

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
app.use('/api/admin', adminRoutes);
app.use('/api/notification', notificationRoutes);

// Engineer auth routes
app.use('/api/engineer/auth', engineerAuthRoutes);


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
