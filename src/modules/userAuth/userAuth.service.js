import { twilioClient, verifySid } from "../../config/twilio.js";

/**
 * Service to handle User OTP operations via Twilio
 */
export const userAuthService = {
  /**
   * Send an OTP to a mobile number
   * @param {string} mobile - The mobile number in E.164 format
   * @returns {Object} Result object containing status
   */
  sendOtp: async (mobile) => {
    try {
      // Bypass for testing numbers from environment variables
      const testNumbers = process.env.TEST_PHONE_NUMBERS ? process.env.TEST_PHONE_NUMBERS.split(',') : [];
      if (testNumbers.some(num => mobile.includes(num.trim()))) {
        return {
          success: true,
          status: "pending_verification",
          message: "Test OTP sent successfully"
        };
      }

      if (!twilioClient) {
        throw new Error("Twilio is not configured");
      }

      const verification = await twilioClient.verify.v2
        .services(verifySid)
        .verifications.create({ to: mobile, channel: 'sms' });

      return {
        success: true,
        status: verification.status,
        message: "OTP sent successfully"
      };
    } catch (error) {
      console.error("[UserAuth Service] Send OTP Error:", error);
      throw error;
    }
  },

  /**
   * Verify an OTP for a mobile number
   * @param {string} mobile - The mobile number
   * @param {string} otp - The OTP code to verify
   * @returns {Object} Result object indicating success or failure
   */
  verifyOtp: async (mobile, otp) => {
    try {
      // Bypass for testing numbers from environment variables
      const testNumbers = process.env.TEST_PHONE_NUMBERS ? process.env.TEST_PHONE_NUMBERS.split(',') : [];
      const testOtp = process.env.TEST_OTP || "1111";
      if (testNumbers.some(num => mobile.includes(num.trim())) && otp === testOtp) {
        return {
          success: true,
          status: "approved",
          message: "Test OTP verified successfully"
        };
      }

      if (!twilioClient) {
        throw new Error("Twilio is not configured");
      }

      const verificationCheck = await twilioClient.verify.v2
        .services(verifySid)
        .verificationChecks.create({ to: mobile, code: otp });

      if (verificationCheck.status === 'approved') {
        return {
          success: true,
          status: verificationCheck.status,
          message: "OTP verified successfully"
        };
      } else {
        return {
          success: false,
          status: verificationCheck.status,
          message: "Invalid OTP"
        };
      }
    } catch (error) {
      console.error("[UserAuth Service] Verify OTP Error:", error);
      throw error;
    }
  },

  /**
   * Resend an OTP to a mobile number
   * @param {string} mobile - The mobile number in E.164 format
   * @returns {Object} Result object containing status
   */
  resendOtp: async (mobile) => {
    try {
      if (!twilioClient) {
        throw new Error("Twilio is not configured");
      }

      const verification = await twilioClient.verify.v2
        .services(verifySid)
        .verifications.create({ to: mobile, channel: 'sms' });

      return {
        success: true,
        status: verification.status,
        message: "OTP resent successfully"
      };
    } catch (error) {
      console.error("[UserAuth Service] Resend OTP Error:", error);
      throw error;
    }
  }
};
