import crypto from 'crypto';

// Boot check: Ensure COUPON_SECRET is defined in production-like environments
const getSecret = () => {
  const secret = process.env.COUPON_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: COUPON_SECRET environment variable is not defined!');
    }
    return 'default_coupon_secret_insecure';
  }
  return secret;
};

/**
 * Generate a secure HMAC validation key with a 15-minute time bucket.
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.couponId
 * @param {number} params.amount - Original amount in paise
 * @param {number} [offset=0] - Offset for time bucket (0 = current, 1 = previous)
 * @returns {string}
 */
const generateKeyWithBucket = ({ userId, couponId, amount }, offset = 0) => {
  const secret = getSecret();
  // 15 minute time bucket
  const timeBucket = Math.floor(Date.now() / (15 * 60 * 1000)) - offset;
  const data = `${userId}:${couponId}:${amount}:${timeBucket}`;
  
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex');
};

/**
 * Public function to generate the initial validation key
 */
export const generateValidationKey = (params) => generateKeyWithBucket(params, 0);

/**
 * Verify if the provided validation key is valid (checks current and previous bucket)
 */
export const verifyValidationKey = ({ userId, couponId, amount, validationKey }) => {
  if (!validationKey) return false;

  const secret = getSecret();
  
  // To avoid boundary issues, we check the current bucket and the previous one
  const currentExpected = generateKeyWithBucket({ userId, couponId, amount }, 0);
  const previousExpected = generateKeyWithBucket({ userId, couponId, amount }, 1);

  const inputBuffer = Buffer.from(validationKey);
  const currentBuffer = Buffer.from(currentExpected);
  const previousBuffer = Buffer.from(previousExpected);

  // timingSafeEqual requires buffers of identical length
  const isCurrentMatch = inputBuffer.length === currentBuffer.length && 
    crypto.timingSafeEqual(inputBuffer, currentBuffer);
    
  const isPreviousMatch = inputBuffer.length === previousBuffer.length && 
    crypto.timingSafeEqual(inputBuffer, previousBuffer);

  return isCurrentMatch || isPreviousMatch;
};
