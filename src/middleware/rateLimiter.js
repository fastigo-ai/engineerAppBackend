import rateLimit from 'express-rate-limit';

// Limiter for authentication routes (e.g., send-otp, verify-otp)
// Max 5 requests per 15 minutes per IP
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
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
