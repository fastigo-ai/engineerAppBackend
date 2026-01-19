// src/controllers/auth.controller.ts
import { admin } from "../config/firebase.js";
import User from "../models/user.js";
import jwt from "jsonwebtoken";
import { twilioClient, verifySid } from "../config/twilio.js";

// Send OTP via Twilio Verify
export const sendOTP = async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({ error: "Mobile number is required" });
    }

    // Validate phone number format (basic validation)
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(mobile)) {
      return res.status(400).json({ error: "Invalid phone number format. Use E.164 format (e.g., +1234567890)" });
    }

    // Find or create user
    let user = await User.findOne({ mobile });

    if (!user) {
      // Create new user with pending verification
      user = new User({
        mobile,
        name: "User", // Default name, can be updated later
        email: `${mobile.replace(/\+/g, '')}@temp.com`, // Temporary email
        password: "otp_user", // Dummy password for OTP users
        userType: "b2c",
        role: "customer",
        status: "pending_verification",
        isPhoneVerified: false,
      });
      await user.save();
    }

    // Send OTP via Twilio Verify
    try {
      const verification = await twilioClient.verify.v2
        .services(verifySid)
        .verifications.create({ to: mobile, channel: 'sms' });

      return res.json({
        message: "OTP sent successfully",
        mobile,
        status: verification.status,
        expiresIn: "10 minutes"
      });
    } catch (twilioError) {
      console.error("Twilio Verify error:", twilioError);
      return res.status(500).json({
        error: "Failed to send OTP. Please check your phone number and try again.",
        details: twilioError.message
      });
    }
  } catch (err) {
    console.error("Send OTP error:", err);
    return res.status(500).json({ error: "Failed to send OTP" });
  }
};

// Verify OTP using Twilio Verify
export const verifyOTP = async (req, res) => {
  try {
    const { mobile, otp } = req.body;

    if (!mobile || !otp) {
      return res.status(400).json({ error: "Mobile number and OTP are required" });
    }

    // Find user by mobile number
    const user = await User.findOne({ mobile });

    if (!user) {
      return res.status(404).json({ error: "User not found. Please request OTP first." });
    }

    // Verify OTP using Twilio Verify
    try {
      const verificationCheck = await twilioClient.verify.v2
        .services(verifySid)
        .verificationChecks.create({ to: mobile, code: otp });

      if (verificationCheck.status === 'approved') {
        // OTP is valid - mark phone as verified
        user.isPhoneVerified = true;
        user.status = "active";

        await user.save();

        // Generate JWT token
        const token = jwt.sign(
          { userId: user._id, role: user.role, userType: user.userType },
          process.env.JWT_SECRET,
          { expiresIn: "7d" }
        );

        return res.json({
          message: "OTP verified successfully",
          user: {
            _id: user._id,
            uid: user.uid,
            name: user.name,
            mobile: user.mobile,
            email: user.email,
            userType: user.userType,
            role: user.role,
            isPhoneVerified: user.isPhoneVerified,
            status: user.status,
          },
          token
        });
      } else {
        return res.status(400).json({ error: "Invalid OTP" });
      }
    } catch (twilioError) {
      console.error("Twilio Verify error:", twilioError);

      // Handle specific Twilio errors
      if (twilioError.code === 20404) {
        return res.status(400).json({ error: "OTP has expired or not found. Please request a new OTP." });
      }

      return res.status(400).json({
        error: "Failed to verify OTP",
        details: twilioError.message
      });
    }
  } catch (err) {
    console.error("Verify OTP error:", err);
    return res.status(500).json({ error: "Failed to verify OTP" });
  }
};


// Resend OTP
export const resendOTP = async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({ error: "Mobile number is required" });
    }

    // Check if user exists
    const user = await User.findOne({ mobile });
    if (!user) {
      return res.status(404).json({ error: "User not found. Please register first." });
    }

    // Resend OTP via Twilio Verify
    try {
      const verification = await twilioClient.verify.v2
        .services(verifySid)
        .verifications.create({ to: mobile, channel: 'sms' });

      return res.json({
        message: "OTP resent successfully",
        mobile,
        status: verification.status
      });
    } catch (twilioError) {
      console.error("Twilio Verify error:", twilioError);
      return res.status(500).json({
        error: "Failed to resend OTP. Please try again later.",
        details: twilioError.message
      });
    }
  } catch (err) {
    console.error("Resend OTP error:", err);
    return res.status(500).json({ error: "Failed to resend OTP" });
  }
};


export const loginWithFirebase = async (req, res) => {
  try {
    const { firebaseToken } = req.body;
    if (!firebaseToken) {
      return res.status(400).json({ error: "Firebase token is required" });
    }

    // Verify Firebase token
    const decoded = await admin.auth().verifyIdToken(firebaseToken);
    const userRecord = await admin.auth().getUser(decoded.uid);

    const uid = decoded.uid;
    const phoneNumber = userRecord.phoneNumber || decoded.phone_number;
    const email = userRecord.email || decoded.email || `${uid}@autogen.com`;
    const displayName = userRecord.displayName || "NO NAME";

    // Split displayName
    const [firstName, ...lastNameParts] = displayName.split(" ");
    const lastName = lastNameParts.join(" ") || "User";

    // Find or create user in MongoDB
    let user = await User.findOne({ $or: [{ mobile: phoneNumber }, { uid }] });

    if (!user) {
      user = new User({
        uid,
        name: displayName,
        mobile: phoneNumber,
        email,
        password: uid, // dummy password for OTP login
        userType: "b2c",
        role: "customer",
        status: "active",
      });
      await user.save();
    } else {
      // Update user info if changed
      user.firstName = firstName || user.firstName;
      user.lastName = lastName || user.lastName;
      user.mobile = phoneNumber || user.mobile;
      user.email = email || user.email;
      if (user.status === "pending_verification") user.status = "active";
      await user.save();
    }

    // Issue backend JWT
    const backendToken = jwt.sign(
      { userId: user._id, role: user.role, userType: user.userType },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.json({ message: "Login successful", user, token: backendToken });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(401).json({ error: "Invalid Firebase token" });
  }
};
export const updateName = async (req, res) => {
  try {
    console.log(req.user, 'req.user');
    const { name } = req.body;
    console.log(name, 'name');
    const user = await User.findByIdAndUpdate(req.user.id, { name }, { new: true });
    console.log(user, 'user');

    // Return full user details
    return res.json({
      message: "Name updated successfully",
      user: {
        _id: user._id,
        uid: user.uid,
        name: user.name,
        mobile: user.mobile,
        email: user.email,
        userType: user.userType,
        role: user.role,
        company: user.company,
        address: user.address,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }
    });
  } catch (err) {
    console.error("Update name error:", err);
    return res.status(400).json({ error: "Failed to update name" });
  }
};

