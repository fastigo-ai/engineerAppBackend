import rateLimit from 'express-rate-limit';

// Limiter for authentication routes (e.g., send-otp, verify-otp)
// Max 30 requests per 15 minutes per IP
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each IP to 30 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: {
    success: false,
    error: 'Too many authentication attempts from this IP, please try again after 15 minutes'
  }
});

// Limiter for heavy data-fetching routes (e.g., nearby locations)
// Max 30 requests per minute per IP
export const nearbyApiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests for nearby locations, please slow down.'
  }
});
// Limiter for coupon application attempts
// Max 10 requests per 15 minutes per IP
export const couponLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many coupon application attempts. Please try again after 15 minutes.'
  }
});

// Limiter for wallet withdrawal requests
// Max 1 request per 5 minutes per engineer
export const walletLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Please wait 5 minutes between withdrawal requests.'
  }
});

// Limiter for booking/checkout creation
// Max 3 bookings per 10 minutes per IP
export const bookingLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many booking attempts. Please try again after 10 minutes.'
  }
});

// Limiter for sensitive admin operations
// Max 10 requests per 15 minutes per IP
export const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many admin requests. Access restricted for 15 minutes.'
  }
});

