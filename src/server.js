import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import config from './config/config.js';
import logger from './middleware/logger.js';
import serviceRoutes from './routes/serviceRoutes.js';
import authRoutes from './routes/authRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import engineerRoutes from './routes/engineerRoutes.js';
import connectDB from './config/db.js';
import { isFirebaseConnected } from './config/firebase.js';
import engineerAuthRoutes from './routes/engineerRoutes/authRoutes.js'; 

// Load environment variables
dotenv.config();

// Connect to database
connectDB();

// Initialize Express app
const app = express();

// Middleware
app.use(cors({ origin: '*', credentials: true }));
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

// Engineer auth routes
app.use('/api/engineer/auth', engineerAuthRoutes);


// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
const PORT = process.env.PORT || config.port || 8080;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
