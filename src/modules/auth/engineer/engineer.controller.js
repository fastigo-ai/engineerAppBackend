import { Engineer } from "./engineer.model.js";
import cloudinary from "../../../config/cloudinary.js";
import { uploadToCloudinary } from "../../../utils/uploadToCloudinary.js";
import * as payoutService from "../../../modules/finance/payouts/payout.service.js";
import jwt from "jsonwebtoken";
import { syncDeviceToken } from "../../notification/core/notification.service.js";
import { engineerAuthService } from "./engineer.service.js";

export const sendOTP = async (req, res) => {
  try {
    const { mobile } = req.body;

    if (!mobile) {
      return res.status(400).json({ success: false, error: "Mobile number is required" });
    }

    // Basic format validation
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(mobile)) {
      return res.status(400).json({ success: false, error: "Invalid phone number format. Use E.164 format (e.g., +911234567890)" });
    }

    // Normalize to 10 digits for DB lookup
    const mobileForDb = mobile.length > 10 ? mobile.slice(-10) : mobile;
    let engineer = await Engineer.findOne({ mobile: mobileForDb });

    if (!engineer) {
      // Check if it's a test number to auto-register for reviewers
      const testNumbers = process.env.TEST_PHONE_NUMBERS ? process.env.TEST_PHONE_NUMBERS.split(',') : [];
      if (testNumbers.some(num => mobile.includes(num.trim()))) {
        console.log(`[Auth] Auto-registering test account: ${mobile}`);
        engineer = new Engineer({
          name: "Test Engineer",
          mobile: mobileForDb,
          email: `${mobileForDb}@test.com`,
          isActive: true,
          isAvailable: true,
          skills: ["Test Service"]
        });
        await engineer.save();
      } else {
        return res.status(404).json({ success: false, error: "Engineer not found or not registered" });
      }
    }

    if (engineer.isBlocked) return res.status(403).json({ success: false, error: "Your account has been blocked. Please contact support." });
    if (engineer.isSuspended) return res.status(403).json({ success: false, error: "Your account has been suspended. Please contact support." });
    if (engineer.isDeleted) return res.status(403).json({ success: false, error: "Your account has been deleted. Please contact support." });
    
    // Force active for test numbers
    const testNumbers = process.env.TEST_PHONE_NUMBERS ? process.env.TEST_PHONE_NUMBERS.split(',') : [];
    if (testNumbers.some(num => mobile.includes(num.trim()))) {
      engineer.isActive = true;
    }

    if (!engineer.isActive) return res.status(403).json({ success: false, error: "Your account is inactive. Please contact support." });

    const result = await engineerAuthService.sendOtp(mobile);
    return res.json({
      success: true,
      message: result.message,
      mobile,
      status: result.status,
      expiresIn: "10 minutes"
    });
  } catch (err) {
    console.error('Engineer Send OTP error:', err);
    res.status(500).json({ success: false, error: "Failed to send OTP", details: err.message });
  }
};

export const verifyOTP = async (req, res) => {
  try {
    const { mobile, otp } = req.body;

    if (!mobile || !otp) {
      return res.status(400).json({ success: false, error: "Mobile number and OTP are required" });
    }

    // Normalize to 10 digits for DB lookup
    const mobileForDb = mobile.length > 10 ? mobile.slice(-10) : mobile;
    const engineer = await Engineer.findOne({ mobile: mobileForDb });

    if (!engineer) {
      return res.status(404).json({ success: false, error: "Engineer not found" });
    }

    const result = await engineerAuthService.verifyOtp(mobile, otp);

    if (result.success) {
      engineer.tokenVersion = (engineer.tokenVersion || 0) + 1;
      await engineer.save();

      const token = jwt.sign(
        { userId: engineer._id, id: engineer._id, role: 'engineer', userType: 'engineer', tokenVersion: engineer.tokenVersion },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
      );


      const engineerDetails = {
        id: engineer._id, name: engineer.name, mobile: engineer.mobile, email: engineer.email,
        address: engineer.address, skills: engineer.skills, isAvailable: engineer.isAvailable,
        isActive: engineer.isActive, location: engineer.location, rating: engineer.rating,
        totalJobs: engineer.totalJobs, completedJobs: engineer.completedJobs
      };

      const { fcmToken, deviceId, platform, appVersion } = req.body;
      if (fcmToken) {
        await syncDeviceToken({
          userId: engineer._id, userModel: 'Engineer', fcmToken, deviceId, platform, appVersion
        }).catch(err => console.error('[EngineerVerifyOTP] FCM Sync failed:', err));
      }

      return res.json({
        success: true,
        message: result.message,
        token,
        engineer: engineerDetails
      });
    } else {
      return res.status(400).json({ success: false, error: "Invalid OTP" });
    }
  } catch (err) {
    console.error('Engineer Verify OTP error:', err);
    if (err.code === 20404) return res.status(400).json({ success: false, error: "OTP has expired or not found" });
    res.status(500).json({ success: false, error: "Failed to verify OTP", details: err.message });
  }
};

export const register = async (req, res) => {
  try {
    const { name, mobile, email, skills, address } = req.body;

    // Validate required fields
    if (!mobile) {
      return res.status(400).json({
        success: false,
        error: "Mobile number is required"
      });
    }

    // Normalize to 10 digits for DB lookup
    const mobileForDb = mobile.length > 10 ? mobile.slice(-10) : mobile;

    // Check if engineer already exists
    const existingEngineer = await Engineer.findOne({ mobile: mobileForDb });
    if (existingEngineer) {
      return res.status(400).json({
        success: false,
        error: "Engineer with this mobile number already exists"
      });
    }

    const engineer = new Engineer({
      name: name || `Engineer ${mobileForDb.slice(-4)}`,
      mobile: mobileForDb,
      email: email || `${mobileForDb}@temp.com`,
      skills: skills || [],
      address: address || '',
      isActive: true,
      isAvailable: true,
      isDeleted: false,
      isBlocked: false,
      isSuspended: false
    });

    await engineer.save();

    // Sync FCM Token if provided in request
    const { fcmToken, deviceId, platform, appVersion } = req.body;
    if (fcmToken) {
      await syncDeviceToken({
        userId: engineer._id,
        userModel: 'Engineer',
        fcmToken,
        deviceId,
        platform,
        appVersion
      }).catch(err => console.error('[EngineerRegister] FCM Sync failed:', err));
    }

    res.status(201).json({
      success: true,
      message: "Engineer registered successfully",
      engineer: {
        id: engineer._id,
        name: engineer.name,
        mobile: engineer.mobile,
        email: engineer.email,
        skills: engineer.skills,
        address: engineer.address
      }
    });
  } catch (err) {
    console.error('Engineer registration error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

export const onboardEngineer = async (req, res) => {
  try {
    const {
      engineer_id,
      name,
      mobile,
      email,
      skills,
      address,
      currentLocation,
      location,
      pincode,
      categories,
      rating,
      isActive = true,
      isAvailable = true,
      bank_name,
      account_number,
      ifsc_code,
      isverifed = true
    } = req.body;

    const finalEngineerId = engineer_id;

    if (!name || !mobile) {
      return res.status(400).json({
        success: false,
        error: "Name and mobile number are required fields"
      });
    }

    const mobileRegex = /^[0-9]{10}$/;
    if (!mobileRegex.test(mobile)) {
      return res.status(400).json({
        success: false,
        error: "Invalid mobile number format. Must be 10 digits."
      });
    }

    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          error: "Invalid email format"
        });
      }
    }

    const result = await Engineer.findOneAndUpdate(
      { mobile: mobile.trim() },
      {
        $set: {
          engineerId: finalEngineerId ? finalEngineerId.trim() : undefined,
          name: name.trim(),
          email: email ? email.trim().toLowerCase() : undefined,
          skills: skills || [],
          address: address ? address.trim() : undefined,
          currentLocation: currentLocation ? currentLocation.trim() : undefined,
          location: location || undefined,
          pincode: pincode ? pincode.trim() : undefined,
          categories: categories || [],
          isActive: isActive,
          isAvailable: isAvailable,
          rating: rating || 0,
          updatedAt: new Date()
        },
        $setOnInsert: {
          totalJobs: 0,
          completedJobs: 0,
          isDeleted: false,
          isBlocked: false,
          isSuspended: false,
          createdAt: new Date()
        }
      },
      {
        new: true,
        upsert: true,
        rawResult: true
      }
    );

    const engineer = result.value || result;
    const isNew = !result.lastErrorObject?.updatedExisting;

    if (account_number && ifsc_code) {
      try {
        let bankAccount = await BankAccount.findOne({ engineerId: engineer._id });

        if (!bankAccount) {
          const contact = await payoutService.createContact(engineer);
          const fundAccount = await payoutService.createFundAccount(contact.id, {
            accountHolderName: name,
            accountNumber: account_number,
            ifsc: ifsc_code
          });

          bankAccount = new BankAccount({
            engineerId: engineer._id,
            accountNumber: account_number,
            ifsc: ifsc_code,
            bankName: bank_name,
            accountHolderName: name,
            fundAccountId: fundAccount.id,
            isVerified: isverifed
          });
          await bankAccount.save();
        } else {
          bankAccount.accountNumber = account_number;
          bankAccount.ifsc = ifsc_code;
          bankAccount.bankName = bank_name;
          bankAccount.isVerified = isverifed;
          await bankAccount.save();
        }
      } catch (bankError) {
        console.error("Failed to initialize Razorpay Bank Account for Onboarding:", bankError.message);
      }
    }

    engineer.tokenVersion = (engineer.tokenVersion || 0) + 1;
    await engineer.save();

    const token = jwt.sign(
      {
        userId: engineer._id,
        id: engineer._id,
        role: 'engineer',
        userType: 'engineer',
        tokenVersion: engineer.tokenVersion
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );


    const { fcmToken, deviceId, platform, appVersion } = req.body;
    if (fcmToken) {
      await syncDeviceToken({
        userId: engineer._id,
        userModel: 'Engineer',
        fcmToken,
        deviceId,
        platform,
        appVersion
      }).catch(err => console.error('[EngineerOnboard] FCM Sync failed:', err));
    }

    res.status(isNew ? 201 : 200).json({
      success: true,
      message: isNew ? "Engineer onboarded successfully" : "Engineer profile synced successfully",
      engineer: {
        id: engineer._id,
        engineerId: engineer.engineerId,
        name: engineer.name,
        mobile: engineer.mobile,
        email: engineer.email,
        skills: engineer.skills,
        address: engineer.address,
        pincode: engineer.pincode,
        categories: engineer.categories,
        currentLocation: engineer.currentLocation,
        location: engineer.location,
        isActive: engineer.isActive,
        isAvailable: engineer.isAvailable,
        rating: engineer.rating,
        totalJobs: engineer.totalJobs,
        completedJobs: engineer.completedJobs,
        createdAt: engineer.createdAt,
        updatedAt: engineer.updatedAt
      },
      token
    });
  } catch (err) {
    console.error('Engineer onboarding error:', err);
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        error: "Engineer with this mobile number already exists"
      });
    }
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};

export const getProfile = async (req, res) => {
  try {
    const engineerId = req.engineer.id;
    const engineer = await Engineer.findById(engineerId).select('-password');

    if (!engineer) {
      return res.status(404).json({
        success: false,
        message: "Engineer not found"
      });
    }

    res.json({
      success: true,
      data: engineer
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const engineerId = req.engineer.id;
    const updates = req.body;

    delete updates.password;
    delete updates.mobile;
    delete updates._id;

    const engineer = await Engineer.findByIdAndUpdate(
      engineerId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');

    if (!engineer) {
      return res.status(404).json({
        success: false,
        message: "Engineer not found"
      });
    }

    res.json({
      success: true,
      data: engineer,
      message: "Profile updated successfully"
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: "Server Error"
    });
  }
};
