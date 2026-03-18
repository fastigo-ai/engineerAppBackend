import STATUS from '../constants/statusCodes.js';

function errorHandler(err, req, res, next) {
  console.error(err.stack);
  const statusCode = err.statusCode || STATUS.INTERNAL_SERVER_ERROR;
  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
}

export default errorHandler;
