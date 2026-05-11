import { twilioClient, verifySid } from "../../config/twilio.js";
import { Engineer } from "../../models/engineersModal.js";

/**
 * Service to handle Engineer OTP operations with production-grade rate limiting
 */
export const engineerAuthService = {
  /**
   * Send an OTP with rate limiting and cooldown checks
   */
  sendOtp: async (mobile) => {
    // 1. Find engineer to check metadata
    const mobileForDb = mobile.length > 10 ? mobile.slice(-10) : mobile;
    const engineer = await Engineer.findOne({ mobile: mobileForDb });

    if (engineer) {
      const now = new Date();
      const meta = engineer.otpMetadata || { requestCount: 0, windowStart: now };

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
      engineer.otpMetadata = meta;
      await engineer.save();
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
      console.error("[EngineerAuth Service] Send OTP Error:", error);
      throw error;
    }
  },

  /**
   * Verify an OTP with attempt limiting
   */
  verifyOtp: async (mobile, otp) => {
    const mobileForDb = mobile.length > 10 ? mobile.slice(-10) : mobile;
    const engineer = await Engineer.findOne({ mobile: mobileForDb });

    if (engineer && engineer.otpMetadata?.blockedUntil && engineer.otpMetadata.blockedUntil > new Date()) {
      throw new Error("Account temporarily blocked due to too many wrong attempts.");
    }

    try {
      // Bypass for testing numbers
      const testNumbers = process.env.TEST_PHONE_NUMBERS ? process.env.TEST_PHONE_NUMBERS.split(',') : [];
      const testOtp = process.env.TEST_OTP || "1111";
      if (testNumbers.some(num => mobile.includes(num.trim())) && otp === testOtp) {
        if (engineer) {
          engineer.otpMetadata.verifyAttempts = 0;
          await engineer.save();
        }
        return { success: true, status: "approved", message: "Test OTP verified" };
      }

      if (!twilioClient) throw new Error("Twilio is not configured");

      const verificationCheck = await twilioClient.verify.v2
        .services(verifySid)
        .verificationChecks.create({ to: mobile, code: otp });

      if (verificationCheck.status === 'approved') {
        if (engineer) {
          engineer.otpMetadata.verifyAttempts = 0;
          await engineer.save();
        }
        return { success: true, status: verificationCheck.status, message: "OTP verified" };
      } else {
        if (engineer) {
          engineer.otpMetadata.verifyAttempts = (engineer.otpMetadata.verifyAttempts || 0) + 1;
          if (engineer.otpMetadata.verifyAttempts >= 5) {
            engineer.otpMetadata.blockedUntil = new Date(Date.now() + 15 * 60 * 1000);
          }
          await engineer.save();
        }
        return { success: false, status: verificationCheck.status, message: "Invalid OTP" };
      }
    } catch (error) {
      console.error("[EngineerAuth Service] Verify OTP Error:", error);
      throw error;
    }
  }
};
