import { Engineer } from "../../models/engineersModal.js";
import jwt from "jsonwebtoken";

export const login = async (req, res) => {
  try {
    const { mobile } = req.body;

    // Validate mobile number
    if (!mobile) {
      return res.status(400).json({
        success: false,
        error: "Mobile number is required"
      });
    }

    // Find engineer by mobile number
    const engineer = await Engineer.findOne({ mobile });

    // If engineer doesn't exist, return 404 error
    if (!engineer) {
      return res.status(404).json({
        success: false,
        error: "User not found or not registered"
      });
    }

    // Check if engineer is blocked or suspended
    if (engineer.isBlocked) {
      return res.status(403).json({
        success: false,
        error: "Your account has been blocked. Please contact support."
      });
    }

    if (engineer.isSuspended) {
      return res.status(403).json({
        success: false,
        error: "Your account has been suspended. Please contact support."
      });
    }

    if (engineer.isDeleted) {
      return res.status(403).json({
        success: false,
        error: "Your account has been deleted. Please contact support."
      });
    }

    if (!engineer.isActive) {
      return res.status(403).json({
        success: false,
        error: "Your account is inactive. Please contact support."
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: engineer._id,
        id: engineer._id,
        role: 'engineer',
        userType: 'engineer'
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // Prepare engineer details
    const engineerDetails = {
      id: engineer._id,
      name: engineer.name,
      mobile: engineer.mobile,
      email: engineer.email,
      address: engineer.address,
      skills: engineer.skills,
      isAvailable: engineer.isAvailable,
      isActive: engineer.isActive,
      isDeleted: engineer.isDeleted,
      isBlocked: engineer.isBlocked,
      isSuspended: engineer.isSuspended,
      assignedOrders: engineer.assignedOrders,
      location: engineer.location,
      rating: engineer.rating,
      totalJobs: engineer.totalJobs,
      completedJobs: engineer.completedJobs,
      createdAt: engineer.createdAt,
      updatedAt: engineer.updatedAt
    };

    res.json({
      success: true,
      token,
      engineer: engineerDetails,
      message: "Login successful"
    });
  } catch (err) {
    console.error('Engineer login error:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
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

    // Check if engineer already exists
    const existingEngineer = await Engineer.findOne({ mobile });
    if (existingEngineer) {
      return res.status(400).json({
        success: false,
        error: "Engineer with this mobile number already exists"
      });
    }

    const engineer = new Engineer({
      name: name || `Engineer ${mobile.slice(-4)}`,
      mobile,
      email: email || `${mobile}@temp.com`,
      skills: skills || [],
      address: address || '',
      isActive: true,
      isAvailable: true,
      isDeleted: false,
      isBlocked: false,
      isSuspended: false
    });

    await engineer.save();

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

/**
 * Onboard Engineer API - Called by FastAPI after engineer approval
 * This endpoint is used by your team's onboarding system to add approved engineers
 */
export const onboardEngineer = async (req, res) => {
  try {
    const {
      engineer_id, // Support both naming conventions
      name,
      mobile,
      email,
      skills,
      address,
      currentLocation, // Location as string
      location, // GeoJSON format
      // Optional fields
      pincode,
      categories,
      rating,
      isActive = true,
      isAvailable = true
    } = req.body;

    // Use engineer_id from payload
    const finalEngineerId = engineer_id;

    // Validate required fields
    if (!name || !mobile) {
      return res.status(400).json({
        success: false,
        error: "Name and mobile number are required fields"
      });
    }

    // Validate mobile number format (basic validation)
    const mobileRegex = /^[0-9]{10}$/;
    if (!mobileRegex.test(mobile)) {
      return res.status(400).json({
        success: false,
        error: "Invalid mobile number format. Must be 10 digits."
      });
    }

    // Validate email format if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          error: "Invalid email format"
        });
      }
    }

    // Check if engineer already exists by mobile
    const existingEngineerByMobile = await Engineer.findOne({ mobile });
    if (existingEngineerByMobile) {
      return res.status(409).json({
        success: false,
        error: "Engineer with this mobile number already exists",
        engineerId: existingEngineerByMobile._id
      });
    }

    // Check if engineer already exists by engineerId (if provided)
    if (finalEngineerId) {
      const existingEngineerById = await Engineer.findOne({ engineerId: finalEngineerId });
      if (existingEngineerById) {
        return res.status(409).json({
          success: false,
          error: "Engineer with this engineer ID already exists",
          engineerId: existingEngineerById._id
        });
      }
    }

    // Validate location format if provided (GeoJSON)
    if (location) {
      if (!location.type || !location.coordinates) {
        return res.status(400).json({
          success: false,
          error: "Invalid location format. Expected GeoJSON format with type and coordinates"
        });
      }
    }

    // Validate skills array
    if (skills && !Array.isArray(skills)) {
      return res.status(400).json({
        success: false,
        error: "Skills must be an array"
      });
    }

    // Create new engineer with approved status
    const engineer = new Engineer({
      engineerId: finalEngineerId ? finalEngineerId.trim() : undefined,
      name: name.trim(),
      mobile: mobile.trim(),
      email: email ? email.trim().toLowerCase() : undefined,
      skills: skills || [],
      address: address ? address.trim() : undefined,
      currentLocation: currentLocation ? currentLocation.trim() : undefined,
      location: location || undefined,
      pincode: pincode ? pincode.trim() : undefined,
      categories: categories || [],
      isActive: isActive,
      isAvailable: isAvailable,
      isDeleted: false,
      isBlocked: false,
      isSuspended: false,
      rating: rating || 0,
      totalJobs: 0,
      completedJobs: 0
    });

    await engineer.save();

    // Generate JWT token for immediate use if needed
    const token = jwt.sign(
      {
        userId: engineer._id,
        id: engineer._id,
        role: 'engineer',
        userType: 'engineer'
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
      success: true,
      message: "Engineer onboarded successfully",
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
      token // Include token for immediate use
    });
  } catch (err) {
    console.error('Engineer onboarding error:', err);

    // Handle duplicate key error
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
