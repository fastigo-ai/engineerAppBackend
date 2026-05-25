import User from "../user/user.model.js";
import jwt from "jsonwebtoken";
import { userAuthService } from "../user/user.service.js";

// Cookie options
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

const accessTokenOptions = {
  ...cookieOptions,
  maxAge: 15 * 60 * 1000, // 15 minutes
};

/**
 * Helper to generate tokens
 */
const generateTokens = (user) => {
  const accessToken = jwt.sign(
    { 
      userId: user._id, 
      role: user.role, 
      userType: user.userType, 
      tokenVersion: user.tokenVersion 
    },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );

  const refreshToken = jwt.sign(
    { 
      userId: user._id, 
      tokenVersion: user.tokenVersion 
    },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  return { accessToken, refreshToken };
};

/**
 * Send OTP for admin login
 */
export const sendOTP = async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({ success: false, error: "Mobile number is required" });
    }

    const user = await User.findOne({ mobile });

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: "You are not an admin. Access denied." 
      });
    }

    if (!['admin', 'super_admin'].includes(user.role)) {
      return res.status(403).json({ 
        success: false, 
        error: "You do not have administrative privileges. Access denied." 
      });
    }

    const result = await userAuthService.sendOtp(mobile);

    return res.json({
      success: true,
      message: "OTP sent successfully",
      mobile,
      status: result.status,
    });
  } catch (err) {
    console.error("[AdminAuth Controller] Send OTP error:", err);
    return res.status(500).json({ success: false, error: "Failed to send OTP" });
  }
};

/**
 * Verify OTP and set cookies
 */
export const verifyOTP = async (req, res) => {
  try {
    const { mobile, otp } = req.body;

    if (!mobile || !otp) {
      return res.status(400).json({ success: false, error: "Mobile number and OTP are required" });
    }

    const user = await User.findOne({ mobile });

    if (!user || !['admin', 'super_admin'].includes(user.role)) {
      return res.status(403).json({ success: false, error: "Unauthorized access" });
    }

    const result = await userAuthService.verifyOtp(mobile, otp);

    if (result.success) {
      // Increment token version for single-device login
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      user.isPhoneVerified = true;
      if (user.status === "pending_verification") user.status = "active";
      await user.save();

      const { accessToken, refreshToken } = generateTokens(user);

      // Set cookies
      res.cookie("admin_access_token", accessToken, accessTokenOptions);
      res.cookie("admin_refresh_token", refreshToken, cookieOptions);

      return res.json({
        success: true,
        message: "Login successful",
        user: {
          _id: user._id,
          name: user.name,
          role: user.role,
        }
      });
    } else {
      return res.status(400).json({ success: false, error: "Invalid OTP" });
    }
  } catch (err) {
    console.error("[AdminAuth Controller] Verify OTP error:", err);
    return res.status(500).json({ success: false, error: "Failed to verify OTP" });
  }
};

/**
 * Refresh Access Token
 */
export const refreshAccessToken = async (req, res) => {
  try {
    const refreshToken = req.cookies.admin_refresh_token;

    if (!refreshToken) {
      return res.status(401).json({ success: false, error: "No refresh token provided" });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || user.tokenVersion !== decoded.tokenVersion) {
      return res.status(401).json({ success: false, error: "Invalid refresh token or session expired" });
    }

    const { accessToken } = generateTokens(user);
    res.cookie("admin_access_token", accessToken, accessTokenOptions);

    return res.json({ success: true, message: "Token refreshed" });
  } catch (err) {
    return res.status(401).json({ success: false, error: "Invalid refresh token" });
  }
};

/**
 * Logout and clear cookies
 */
export const logout = async (req, res) => {
  res.clearCookie("admin_access_token", accessTokenOptions);
  res.clearCookie("admin_refresh_token", cookieOptions);
  return res.json({ success: true, message: "Logged out successfully" });
};

/**
 * Get current admin profile (to check if logged in)
 */
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('name role email mobile profileImage');
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    
    return res.json({ success: true, user });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
};
