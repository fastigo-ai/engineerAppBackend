import { twilioClient, verifySid } from "../../../config/twilio.js";
import User from "./user.model.js";

/**
 * Service to handle User OTP operations with production-grade rate limiting
 */
export const userAuthService = {
  /**
   * Send an OTP with rate limiting and cooldown checks
   */
  sendOtp: async (mobile) => {
    const user = await User.findOne({ mobile });

    if (user) {
      const now = new Date();
      const meta = user.otpMetadata || { requestCount: 0, windowStart: now };

      // Check for block
      if (meta.blockedUntil && meta.blockedUntil > now) {
        const remaining = Math.ceil((meta.blockedUntil - now) / (60 * 1000));
        throw new Error(`Too many attempts. Blocked for ${remaining} more minutes.`);
      }

      // Check for resend cooldown (30 seconds)
      if (meta.lastSentAt && (now - meta.lastSentAt) < 30000) {
        throw new Error("Please wait 30 seconds before resending OTP.");
      }

      // Check for window limit (8 OTPs per 15 minutes)
      const windowMs = 15 * 60 * 1000;
      if (now - meta.windowStart > windowMs) {
        meta.requestCount = 0;
        meta.windowStart = now;
      }

      if (meta.requestCount >= 8) {
        const wait = Math.ceil((windowMs - (now - meta.windowStart)) / (60 * 1000));
        throw new Error(`OTP limit reached. Try again in ${wait} minutes.`);
      }

      // Update metadata
      meta.requestCount += 1;
      meta.lastSentAt = now;
      user.otpMetadata = meta;
      await user.save();
    }

    try {
      // Bypass for testing numbers
      const testNumbers = process.env.TEST_PHONE_NUMBERS ? process.env.TEST_PHONE_NUMBERS.split(',') : [];
      if (testNumbers.some(num => mobile.includes(num.trim()))) {
        return { success: true, status: "pending_verification", message: "Test OTP sent" };
      }

      if (!twilioClient) throw new Error("Twilio is not configured");

      const verification = await twilioClient.verify.v2
        .services(verifySid)
        .verifications.create({ to: mobile, channel: 'sms' });

      return { success: true, status: verification.status, message: "OTP sent successfully" };
    } catch (error) {
      console.error("[UserAuth Service] Send OTP Error:", error);
      throw error;
    }
  },

  /**
   * Verify an OTP with attempt limiting
   */
  verifyOtp: async (mobile, otp) => {
    const user = await User.findOne({ mobile });

    if (user && user.otpMetadata?.blockedUntil && user.otpMetadata.blockedUntil > new Date()) {
      throw new Error("Account temporarily blocked due to too many wrong attempts.");
    }

    try {
      // Bypass for testing numbers
      const testNumbers = process.env.TEST_PHONE_NUMBERS ? process.env.TEST_PHONE_NUMBERS.split(',') : [];
      const testOtp = process.env.TEST_OTP || "1111";
      if (testNumbers.some(num => mobile.includes(num.trim())) && otp === testOtp) {
        if (user) {
          user.otpMetadata.verifyAttempts = 0;
          await user.save();
        }
        return { success: true, status: "approved", message: "Test OTP verified" };
      }

      if (!twilioClient) throw new Error("Twilio is not configured");

      const verificationCheck = await twilioClient.verify.v2
        .services(verifySid)
        .verificationChecks.create({ to: mobile, code: otp });

      if (verificationCheck.status === 'approved') {
        if (user) {
          user.otpMetadata.verifyAttempts = 0;
          await user.save();
        }
        return { success: true, status: verificationCheck.status, message: "OTP verified" };
      } else {
        if (user) {
          user.otpMetadata.verifyAttempts = (user.otpMetadata.verifyAttempts || 0) + 1;
          if (user.otpMetadata.verifyAttempts >= 5) {
            user.otpMetadata.blockedUntil = new Date(Date.now() + 15 * 60 * 1000);
          }
          await user.save();
        }
        return { success: false, status: verificationCheck.status, message: "Invalid OTP" };
      }
    } catch (error) {
      console.error("[UserAuth Service] Verify OTP Error:", error);
      throw error;
    }
  },

  /**
   * Resend an OTP (uses the same rate limiting as sendOtp)
   */
  resendOtp: async (mobile) => {
    return userAuthService.sendOtp(mobile);
  }
};
