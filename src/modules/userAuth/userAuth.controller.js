import { admin } from "../../config/firebase.js";
import User from "../../models/user.js";
import jwt from "jsonwebtoken";
import { syncDeviceToken } from "../notification/notification.service.js";
import { uploadToCloudinary } from "../../utils/uploadToCloudinary.js";
import cloudinary from "../../config/cloudinary.js";
import { userAuthService } from "./userAuth.service.js";

export const sendOTP = async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({ error: "Mobile number is required" });
    }

    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(mobile)) {
      return res.status(400).json({ error: "Invalid phone number format. Use E.164 format (e.g., +1234567890)" });
    }

    let user = await User.findOne({ mobile });

    if (!user) {
      user = new User({
        mobile,
        name: "User",
        email: `${mobile.replace(/\+/g, '')}@temp.com`,
        password: "otp_user",
        userType: "b2c",
        role: "customer",
        status: "pending_verification",
        isPhoneVerified: false,
      });
      await user.save();
    }

    const result = await userAuthService.sendOtp(mobile);

    return res.json({
      message: "OTP sent successfully",
      mobile,
      status: result.status,
      expiresIn: "10 minutes"
    });
  } catch (err) {
    console.error("Send OTP error:", err);
    return res.status(500).json({ error: "Failed to send OTP", details: err.message });
  }
};

export const resendOTP = async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({ error: "Mobile number is required" });
    }

    const user = await User.findOne({ mobile });
    if (!user) {
      return res.status(404).json({ error: "User not found. Please register first." });
    }

    const result = await userAuthService.resendOtp(mobile);

    return res.json({
      message: "OTP resent successfully",
      mobile,
      status: result.status
    });
  } catch (err) {
    console.error("Resend OTP error:", err);
    return res.status(500).json({ error: "Failed to resend OTP", details: err.message });
  }
};

export const verifyOTP = async (req, res) => {
  try {
    const { mobile, otp } = req.body;

    if (!mobile || !otp) {
      return res.status(400).json({ error: "Mobile number and OTP are required" });
    }

    const user = await User.findOne({ mobile });

    if (!user) {
      return res.status(404).json({ error: "User not found. Please request OTP first." });
    }

    const result = await userAuthService.verifyOtp(mobile, otp);

    if (result.success) {
      user.isPhoneVerified = true;
      user.status = "active";
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      await user.save();


      const { fcmToken, deviceId, platform, appVersion } = req.body;
      if (fcmToken) {
        await syncDeviceToken({
          userId: user._id,
          userModel: 'User',
          fcmToken,
          deviceId,
          platform,
          appVersion
        }).catch(err => console.error('[VerifyOTP] FCM Sync failed:', err));
      }

      const token = jwt.sign(
        { userId: user._id, role: user.role, userType: user.userType, tokenVersion: user.tokenVersion },
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
          profileImage: user.profileImage,
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
  } catch (err) {
    console.error("Verify OTP error:", err);
    if (err.code === 20404) return res.status(400).json({ error: "OTP has expired or not found. Please request a new OTP." });
    return res.status(500).json({ error: "Failed to verify OTP", details: err.message });
  }
};

export const loginWithFirebase = async (req, res) => {
  try {
    const { firebaseToken } = req.body;
    if (!firebaseToken) {
      return res.status(400).json({ error: "Firebase token is required" });
    }

    const decoded = await admin.auth().verifyIdToken(firebaseToken);
    const userRecord = await admin.auth().getUser(decoded.uid);

    const uid = decoded.uid;
    const phoneNumber = userRecord.phoneNumber || decoded.phone_number;
    const email = userRecord.email || decoded.email || `${uid}@autogen.com`;
    const displayName = userRecord.displayName || "NO NAME";

    const [firstName, ...lastNameParts] = displayName.split(" ");
    const lastName = lastNameParts.join(" ") || "User";

    let user = await User.findOne({ $or: [{ mobile: phoneNumber }, { uid }] });

    if (!user) {
      user = new User({
        uid,
        name: displayName,
        mobile: phoneNumber,
        email,
        password: uid,
        userType: "b2c",
        role: "customer",
        status: "active",
      });
      await user.save();
    } else {
      user.firstName = firstName || user.firstName;
      user.lastName = lastName || user.lastName;
      user.mobile = phoneNumber || user.mobile;
      user.email = email || user.email;
      if (user.status === "pending_verification") user.status = "active";
      user.tokenVersion = (user.tokenVersion || 0) + 1;
      await user.save();

    }

    const backendToken = jwt.sign(
      { userId: user._id, role: user.role, userType: user.userType, tokenVersion: user.tokenVersion },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );


    const { fcmToken, deviceId, platform, appVersion } = req.body;
    if (fcmToken) {
      await syncDeviceToken({
        userId: user._id,
        userModel: 'User',
        fcmToken,
        deviceId,
        platform,
        appVersion
      }).catch(err => console.error('[Login] FCM Sync failed:', err));
    }

    return res.json({ message: "Login successful", user, token: backendToken });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(401).json({ error: "Invalid Firebase token" });
  }
};

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    return res.json({
      success: true,
      user: {
        _id: user._id,
        uid: user.uid,
        name: user.name,
        mobile: user.mobile,
        email: user.email,
        profileImage: user.profileImage,
        userType: user.userType,
        role: user.role,
        status: user.status,
      }
    });
  } catch (err) {
    console.error("Get profile error:", err);
    return res.status(500).json({ error: "Failed to get profile data" });
  }
};

export const updateName = async (req, res) => {
  try {
    const { name } = req.body;
    const user = await User.findByIdAndUpdate(req.user.id, { name }, { new: true });

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

export const uploadProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image file provided" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.profileImage) {
      try {
        const urlParts = user.profileImage.split('/');
        const folderAndFile = urlParts.slice(-2).join('/');
        const publicId = folderAndFile.replace(/\.[^.]+$/, '');
        await cloudinary.uploader.destroy(publicId);
      } catch (err) {
        console.error('Failed to delete old profile image:', err);
      }
    }

    const { url } = await uploadToCloudinary(req.file.buffer, "profile_images");

    user.profileImage = url;
    await user.save();

    return res.json({
      message: "Profile image updated successfully",
      profileImage: url,
    });
  } catch (err) {
    console.error("Upload profile image error:", err);
    return res.status(500).json({ error: "Failed to upload profile image" });
  }
};

export const removeProfileImage = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.profileImage) {
      try {
        const urlParts = user.profileImage.split('/');
        const folderAndFile = urlParts.slice(-2).join('/');
        const publicId = folderAndFile.replace(/\.[^.]+$/, '');
        await cloudinary.uploader.destroy(publicId);
      } catch (err) {
        console.error('Failed to delete profile image from Cloudinary:', err);
      }
    }

    user.profileImage = null;
    await user.save();

    return res.json({
      message: "Profile image removed successfully",
    });
  } catch (err) {
    console.error("Remove profile image error:", err);
    return res.status(500).json({ error: "Failed to remove profile image" });
  }
};

/**
 * Optimized GET all customers for Admin Dashboard
 * Supports: Search (name, phone, email), City Filter, and Pagination
 * Aggregates: Total Bookings, Total Spent, and Last Booking Date
 */
export const getCustomersAdminController = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 10, 
            search = '', 
            city = 'all',
            status = 'all',
            isPhoneVerified = 'all'
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const limitNum = parseInt(limit);

        const match = { role: 'customer' };

        // 1. Search (Name, Phone, Email)
        if (search) {
            match.$or = [
                { name: { $regex: search, $options: 'i' } },
                { mobile: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        // 2. City Filter
        if (city && city !== 'all') {
            match.city = city;
        }

        // 3. Status Filter
        if (status && status !== 'all') {
            match.status = status;
        }

        // 4. Phone Verified Filter
        if (isPhoneVerified !== 'all') {
            match.isPhoneVerified = isPhoneVerified === 'true';
        }

        // Execute Aggregation
        const [results] = await User.aggregate([
            { $match: match },
            {
                $lookup: {
                    from: 'orders', // MongoDB collection name for OrderSchema
                    localField: '_id',
                    foreignField: 'userId',
                    as: 'orderHistory'
                }
            },
            {
                $facet: {
                    metadata: [{ $count: "total" }],
                    stats: [
                        {
                            $group: {
                                _id: null,
                                totalCustomers: { $sum: 1 },
                                totalRevenue: { $sum: { $sum: "$orderHistory.amount" } },
                                activeCustomers: {
                                    $sum: {
                                        $cond: [
                                            { 
                                                $gt: [
                                                    { $max: "$orderHistory.createdAt" }, 
                                                    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // Active in last 30 days
                                                ] 
                                            },
                                            1,
                                            0
                                        ]
                                    }
                                }
                            }
                        }
                    ],
                    data: [
                        {
                            $project: {
                                name: 1,
                                mobile: 1,
                                email: 1,
                                profileImage: 1,
                                status: 1,
                                city: 1,
                                createdAt: 1,
                                totalBookings: { $size: "$orderHistory" },
                                totalSpent: { $sum: "$orderHistory.amount" },
                                lastBookingDate: { $max: "$orderHistory.createdAt" }
                            }
                        },
                        { $sort: { createdAt: -1 } },
                        { $skip: skip },
                        { $limit: limitNum }
                    ]
                }
            }
        ]);

        const totalCount = results.metadata[0]?.total || 0;
        const globalStats = results.stats[0] || {
            totalCustomers: 0,
            totalRevenue: 0,
            activeCustomers: 0
        };

        return res.status(200).json({
            success: true,
            message: 'Customers retrieved successfully',
            data: results.data,
            stats: globalStats,
            pagination: {
                totalCount,
                totalPages: Math.ceil(totalCount / limitNum),
                currentPage: parseInt(page),
                limit: limitNum,
                hasMore: skip + results.data.length < totalCount
            }
        });

    } catch (error) {
        console.error('[UserAuth] Admin get customers error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve customers',
            error: error.message
        });
    }
};
