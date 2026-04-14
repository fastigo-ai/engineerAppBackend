import crypto from 'crypto';

/**
 * Generate a secure HMAC validation key to prevent tampering with discount values.
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.couponId
 * @param {number} params.amount - Original amount in paise
 * @returns {string}
 */
export const generateValidationKey = ({ userId, couponId, amount }) => {
  const secret = process.env.COUPON_SECRET || 'default_coupon_secret';
  const data = `${userId}:${couponId}:${amount}`;
  return crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('hex');
};

/**
 * Verify if the provided validation key is valid.
 */
export const verifyValidationKey = ({ userId, couponId, amount, validationKey }) => {
  const expectedKey = generateValidationKey({ userId, couponId, amount });
  return expectedKey === validationKey;
};
