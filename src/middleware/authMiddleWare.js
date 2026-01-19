import jwt from 'jsonwebtoken';
import User from '../models/user.js';
import { Engineer } from '../models/engineersModal.js';

export const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    console.log(authHeader, 'authHeader');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    // Extract token
    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Invalid token format.'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log(decoded, 'decoded');
    // Check if user exists
    const user = await User.findById(decoded.userId || decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found. Token is invalid.'
      });
    }

    // Check if user is active
    if (user.status === 'inactive' || user.status === 'blocked') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support.'
      });
    }

    // Attach user to request object
    req.user = {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired. Please login again.'
      });
    }

    console.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during authentication.'
    });
  }
};

// Engineer-specific Authentication Middleware
export const authenticateEngineer = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    console.log(authHeader, 'authHeader [Engineer]');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    // Extract token
    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Invalid token format.'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log(decoded, 'decoded [Engineer]');

    // Check if engineer exists
    const engineer = await Engineer.findById(decoded.userId || decoded.id).select('-password');

    if (!engineer) {
      return res.status(401).json({
        success: false,
        message: 'Engineer not found. Token is invalid.'
      });
    }

    // Check if engineer is blocked or suspended
    if (engineer.isBlocked) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been blocked. Please contact support.'
      });
    }

    if (engineer.isSuspended) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been suspended. Please contact support.'
      });
    }

    if (!engineer.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account is inactive. Please contact support.'
      });
    }

    // Attach engineer to request object
    req.engineer = {
      id: engineer._id,
      engineerId: engineer.engineerId,
      email: engineer.email,
      mobile: engineer.mobile,
      name: engineer.name,
      isVerified: engineer.isVerified,
      isAvailable: engineer.isAvailable,
      status: engineer.status
    };

    // Also set req.user for compatibility
    req.user = {
      id: engineer._id,
      role: 'engineer'
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired. Please login again.'
      });
    }

    console.error('Engineer authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during authentication.'
    });
  }
};

// Optional Role-based Authorization Middleware
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not have permission to perform this action.'
      });
    }

    next();
  };
};

// Optional: Verify User ID matches
export const verifyUserOwnership = (req, res, next) => {
  const userId = req.params.userId || req.body.userId;

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: 'User ID is required.'
    });
  }

  if (req.user.id !== userId && req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You can only access your own data.'
    });
  }

  next();
};