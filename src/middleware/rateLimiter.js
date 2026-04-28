import rateLimit from 'express-rate-limit';

// Limiter for authentication routes (e.g., send-otp, verify-otp)
// Max 5 requests per 15 minutes per IP
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Increased to 20 to be more permissive
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const mobile = req.body?.mobile;
    if (mobile) {
      const testNumbers = process.env.TEST_PHONE_NUMBERS ? process.env.TEST_PHONE_NUMBERS.split(',') : [];
      return testNumbers.some(num => mobile.includes(num.trim()));
    }
    return false;
  },
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
