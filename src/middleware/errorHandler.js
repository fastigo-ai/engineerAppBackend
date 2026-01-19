// src/middleware/errorHandler.js

/**
 * Express error handling middleware (Error Boundary for backend)
 * Catches errors and sends a consistent error response
 */
const STATUS = require('../constants/statusCodes');

function errorHandler(err, req, res, next) {
  console.error(err.stack);
  const statusCode = err.statusCode || STATUS.INTERNAL_SERVER_ERROR;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

module.exports = errorHandler;
