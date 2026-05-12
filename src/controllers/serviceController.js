import STATUS_CODES from '../constants/statusCodes.js';
import {
  addServiceToPlanService,
  bulkAddServicesAllTypesService,
  getAllServicesService,
  getServicesByPlanTypeService,
  getServiceByIdService,
  getServicesByCategoryService,
  createCategoryService,
  createServicePlanService,
  getAllCategoryService,
} from '../services/servicePlanService.js';
import { Category } from "../models/categoryModal.js"
import { uploadToCloudinary } from '../utils/uploadToCloudinary.js';
import { ServicePlan } from '../models/serviceModal.js';
import { ServicePlans } from '../models/planModal.js';
import { Order } from '../models/orderSchema.js';
import VendorOrder from '../models/vendorOrderModal.js';
import { notifyEngineersForOrder } from '../services/notificationEngineerService.js';
import { notifyBookingUpdate } from '../services/notification/notificationService.js';
import mongoose from 'mongoose';


// Helpers and other utilities can go here



export const addServiceToPlanController = async (req, res) => {
  try {
    const { planType } = req.params;
    const updated = await addServiceToPlanService(planType, req.body);
    res.status(STATUS_CODES.CREATED).json({
      success: true,
      data: updated,
      message: 'Service added to plan successfully'
    });
  } catch (error) {
    const code = error.message.includes('required') ||
      error.message.includes('Invalid') ||
      error.message.includes('must be') ||
      error.message.includes('not found') ||
      error.message.includes('format')
      ? STATUS_CODES.BAD_REQUEST
      : error.message.includes('already exists')
        ? STATUS_CODES.CONFLICT
        : STATUS_CODES.INTERNAL_SERVER_ERROR;
    res.status(code).json({ success: false, message: error.message });
  }
};

export const bulkAddServicesAllTypesController = async (req, res) => {
  try {

    const results = await bulkAddServicesAllTypesService(req.body);
    res.status(STATUS_CODES.CREATED).json({
      success: true,
      data: results,
      message: 'Services added to plan types successfully'
    });
  } catch (error) {
    const code = error.message.includes('required') ||
      error.message.includes('must have') ||
      error.message.includes('must be') ||
      error.message.includes('Invalid') ||
      error.message.includes('not found') ||
      error.message.includes('format')
      ? STATUS_CODES.BAD_REQUEST
      : STATUS_CODES.INTERNAL_SERVER_ERROR;
    res.status(code).json({ success: false, message: error.message });
  }
};

export const getAllServicesController = async (req, res) => {
  try {
    const services = await getAllServicesService();
    // console.log(services, "services");
    res.status(STATUS_CODES.SUCCESS).json({
      success: true,
      data: services,
      message: 'All services retrieved successfully'
    });
  } catch (error) {
    const code = error.message.includes('not found')
      ? STATUS_CODES.NOT_FOUND
      : STATUS_CODES.INTERNAL_SERVER_ERROR;
    res.status(code).json({ success: false, message: error.message });
  }
};

export const getServicesByPlanTypeController = async (req, res) => {
  try {
    const { planType } = req.params;
    const plan = await getServicesByPlanTypeService(planType);
    res.status(STATUS_CODES.SUCCESS).json({
      success: true,
      data: plan,
      message: `${planType} services retrieved successfully`
    });
  } catch (error) {
    const code = error.message.includes('Invalid') ||
      error.message.includes('required')
      ? STATUS_CODES.BAD_REQUEST
      : error.message.includes('not found')
        ? STATUS_CODES.NOT_FOUND
        : STATUS_CODES.INTERNAL_SERVER_ERROR;
    res.status(code).json({ success: false, message: error.message });
  }
};

export const getServiceByIdController = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const service = await getServiceByIdService(serviceId);
    res.status(STATUS_CODES.SUCCESS).json({
      success: true,
      data: service,
      message: 'Service retrieved successfully'
    });
  } catch (error) {
    const code = error.message.includes('required') ||
      error.message.includes('Invalid') ||
      error.message.includes('format')
      ? STATUS_CODES.BAD_REQUEST
      : error.message.includes('not found')
        ? STATUS_CODES.NOT_FOUND
        : STATUS_CODES.INTERNAL_SERVER_ERROR;
    res.status(code).json({ success: false, message: error.message });
  }
};

export const getServicesByCategoryController = async (req, res) => {
  try {
    const { category } = req.params;
    const services = await getServicesByCategoryService(category);
    res.status(STATUS_CODES.SUCCESS).json({
      success: true,
      data: services,
      message: `Services for category '${category}' retrieved successfully`
    });
  } catch (error) {
    const code = error.message.includes('required')
      ? STATUS_CODES.BAD_REQUEST
      : error.message.includes('not found')
        ? STATUS_CODES.NOT_FOUND
        : STATUS_CODES.INTERNAL_SERVER_ERROR;
    res.status(code).json({ success: false, message: error.message });
  }
};

export const createCategoryController = async (req, res) => {
  try {
    const category = await createCategoryService(req.body, req.file);
    res.status(201).json({
      success: true,
      data: category,
    });
  } catch (error) {
    console.error(error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({ success: false, message: error.message });
  }
};

export const createServicePlanController = async (req, res) => {
  try {
    const servicePlan = await createServicePlanService(req.body, req.file);
    res.status(201).json({
      success: true,
      data: servicePlan,
    });
  } catch (error) {
    console.error(error);
    res
      .status(STATUS_CODES.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: error.message });
  }
};


export const getAllCategoryController = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    const match = {};
    if (search) {
      match.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const [results] = await Category.aggregate([
      { $match: match },
      { $sort: { name: 1 } },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $skip: skip },
            { $limit: limitNum }
          ]
        }
      }
    ]);

    const total = results.metadata[0]?.total || 0;

    res.status(STATUS_CODES.SUCCESS).json({
      success: true,
      data: results.data,
      pagination: {
        totalCategories: total,
        totalPages: Math.ceil(total / limitNum),
        currentPage: parseInt(page),
        limit: limitNum
      },
      message: 'Categories retrieved successfully'
    });
  } catch (error) {
    console.error('[ServiceController] Get all category error:', error);
    res.status(STATUS_CODES.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: error.message
    });
  }
};

export const getAllServices = async (req, res) => {
  try {
    const allServices = await Category.aggregate([
      {
        // Lookup all services for each category
        $lookup: {
          from: 'servicePlan',
          localField: '_id',
          foreignField: 'category',
          as: 'allServices'
        }
      },
      {
        // Limit to 2 services per category
        $addFields: {
          allServices: { $slice: ['$allServices', 2] }
        }
      },
      {
        // Lookup plan types
        $lookup: {
          from: 'servicePlans',
          localField: 'allServices.planType',
          foreignField: '_id',
          as: 'planTypeDetails'
        }
      },
      {
        // Group services by plan type within each category
        $addFields: {
          planTypes: {
            $map: {
              input: {
                $setUnion: [
                  { $map: { input: '$allServices', as: 'service', in: '$$service.planType' } }
                ]
              },
              as: 'planTypeId',
              in: {
                $let: {
                  vars: {
                    planTypeInfo: {
                      $arrayElemAt: [
                        { $filter: { input: '$planTypeDetails', cond: { $eq: ['$$this._id', '$$planTypeId'] } } },
                        0
                      ]
                    }
                  },
                  in: {
                    _id: '$$planTypeId',
                    planType: '$$planTypeInfo.planType',
                    services: {
                      $filter: {
                        input: '$allServices',
                        cond: { $eq: ['$$this.planType', '$$planTypeId'] }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      {
        // Clean up the response structure
        $project: {
          _id: 1,
          name: 1,
          description: 1,
          image: 1,
          planTypes: {
            $map: {
              input: '$planTypes',
              as: 'planType',
              in: {
                planType: '$$planType.planType',
                services: {
                  $map: {
                    input: '$$planType.services',
                    as: 'service',
                    in: {
                      _id: '$$service._id',
                      name: '$$service.name',
                      subtitle: '$$service.subtitle',
                      price: '$$service.price',
                      image: '$$service.image',
                      features: '$$service.features',
                      createdAt: '$$service.createdAt',
                      updatedAt: '$$service.updatedAt'
                    }
                  }
                }
              }
            }
          },
          createdAt: 1,
          updatedAt: 1
        }
      },
      {
        // Only include categories that have services
        $match: {
          'planTypes.services.0': { $exists: true }
        }
      },
      {
        // Sort categories by name
        $sort: { name: 1 }
      }
    ]);

    // Calculate totals
    let totalServices = 0;
    let totalPlanTypes = 0;

    allServices.forEach(category => {
      category.planTypes.forEach(planType => {
        totalServices += planType.services.length;
      });
      totalPlanTypes += category.planTypes.length;
    });

    res.status(200).json({
      success: true,
      message: 'All services retrieved successfully',
      data: {
        categories: allServices,
        summary: {
          totalCategories: allServices.length,
          totalPlanTypes: totalPlanTypes,
          totalServices: totalServices
        }
      }
    });

  } catch (error) {
    console.error('Get all services error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to retrieve all services',
      error: error.message
    });
  }
};


export const updateCategoryImages = async (req, res) => {
  try {
    let { ids } = req.body; // array of category IDs
    const files = req.files;

    // If ids is stringified JSON, parse it
    if (typeof ids === "string") {
      ids = JSON.parse(ids);
    }

    console.log(ids[1]);
    console.log(files.length);


    if (!ids || !Array.isArray(ids) || ids.length !== files.length) {
      return res.status(400).json({ message: "IDs and images must match in length" });
    }

    const updatedCategories = [];

    for (let i = 0; i < ids.length; i++) {
      const file = files[i];
      const { url } = await uploadToCloudinary(file.buffer, "categories");

      const updated = await Category.findByIdAndUpdate(
        ids[i],
        { image: url },
        { new: true }
      );

      updatedCategories.push(updated);
    }

    res.json({ success: true, data: updatedCategories });
  } catch (err) {
    console.error("Error updating category images:", err);
    res.status(500).json({ message: "Server error" });
  }
};


export const updateServicePlanImages = async (req, res) => {
  try {
    const { ids } = req.body;
    const files = req.files;

    if (typeof ids === "string") {
      ids = JSON.parse(ids);
    }


    if (!ids || !Array.isArray(ids) || ids.length !== files.length) {
      return res.status(400).json({ message: "IDs and images must match in length" });
    }

    const updatedPlans = [];

    for (let i = 0; i < ids.length; i++) {
      const file = files[i];
      const { url } = await uploadToCloudinary(file.buffer, "servicePlans");

      const updated = await ServicePlan.findByIdAndUpdate(
        ids[i],
        { image: url },
        { new: true }
      );

      updatedPlans.push(updated);
    }

    res.json({ success: true, data: updatedPlans });
  } catch (err) {
    console.error("Error updating service plan images:", err);
    res.status(500).json({ message: "Server error" });
  }
};


export const createCategory = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Category name is required" });
    }

    let imageUrl = null;

    // Upload image to Cloudinary using the utility function
    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer, "categories");
      imageUrl = uploadResult.url;
    }

    const category = await Category.create({
      name,
      description,
      image: imageUrl,
    });

    return res.status(201).json({
      message: "Category created successfully",
      data: category,
    });
  } catch (error) {
    console.error("Error creating category:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message
    });
  }
};

export const createServicePlan = async (req, res) => {
  try {
    const { name, subtitle, price, features, planType, category } = req.body;

    if (!name || !price || !planType || !category) {
      return res.status(400).json({
        message: "Name, price, planType, and category are required",
      });
    }

    let imageUrl = null;

    // Upload image to Cloudinary using the utility function
    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer, "servicePlans");
      imageUrl = uploadResult.url;
    }

    const parsedFeatures = features ? JSON.parse(features) : [];

    // Format features with bullet points
    const featuresFormatted = parsedFeatures.map(feature =>
      feature.startsWith('•') ? feature : `• ${feature}`
    );

    const newServicePlan = await ServicePlan.create({
      name,
      subtitle,
      price,
      image: imageUrl,
      features: parsedFeatures,
      featuresFormatted,
      planType,
      category,
    });

    return res.status(201).json({
      message: "Service plan created successfully",
      data: newServicePlan,
    });
  } catch (error) {
    console.error("Error creating service plan:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message
    });
  }
};

export const createServicePlanType = async (req, res) => {
  try {
    const { planType } = req.body;

    if (!planType) {
      return res.status(400).json({ message: "Plan type is required" });
    }

    const validTypes = ["Booking", "Quick"];
    if (!validTypes.includes(planType)) {
      return res.status(400).json({
        message: "Invalid plan type. Use 'Booking' or 'Quick'."
      });
    }

    const existing = await ServicePlans.findOne({ planType });
    if (existing) {
      return res.status(400).json({ message: "Plan type already exists" });
    }

    const newPlanType = await ServicePlans.create({ planType });

    return res.status(201).json({
      message: "Service plan type created successfully",
      data: newPlanType,
    });
  } catch (error) {
    console.error("Error creating service plan type:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message
    });
  }
};


export const getPlanTypes = async (req, res) => {
  try {
    const planTypes = await ServicePlans.find();
    res.status(200).json({ success: true, data: planTypes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
// controllers/servicePlanController.js

export const getAllServicePlans = async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', category = '', planType = '' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    const match = {};
    if (search) {
      match.$or = [
        { name: { $regex: search, $options: 'i' } },
        { subtitle: { $regex: search, $options: 'i' } }
      ];
    }
    if (category) {
      match.category = category;
    }
    if (planType) {
      match.planType = planType;
    }

    const [results] = await ServicePlan.aggregate([
      { $match: match },
      {
        $lookup: {
          from: 'categories',
          localField: 'category',
          foreignField: '_id',
          as: 'categoryDetails'
        }
      },
      { $unwind: { path: '$categoryDetails', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'plantype',
          localField: 'planType',
          foreignField: '_id',
          as: 'planTypeDetails'
        }
      },
      { $unwind: { path: '$planTypeDetails', preserveNullAndEmptyArrays: true } },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limitNum },
            {
              $project: {
                _id: 1,
                name: 1,
                subtitle: 1,
                price: 1,
                image: 1,
                features: 1,
                featuresFormatted: 1,
                category: '$categoryDetails',
                planType: '$planTypeDetails',
                createdAt: 1,
                duration: 1
              }
            }
          ]
        }
      }
    ]);

    const totalCount = results.metadata[0]?.total || 0;

    res.status(200).json({
      success: true,
      data: results.data,
      pagination: {
        totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
        currentPage: parseInt(page),
        limit: limitNum,
        hasMore: skip + results.data.length < totalCount
      }
    });
  } catch (error) {
    console.error('[ServiceController] Get all service plans error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

export const getAllServicePlansAdmin = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 10,
      search = "",
      category = "",
      planType = "",
    } = req.query;

    page = Math.max(1, parseInt(page));
    limit = Math.max(1, parseInt(limit));

    const skip = (page - 1) * limit;

    // -----------------------------
    // Build Match Query
    // -----------------------------
    const match = {};

    // Search
    if (search?.trim()) {
      match.$or = [
        { name: { $regex: search.trim(), $options: "i" } },
        { subtitle: { $regex: search.trim(), $options: "i" } },
      ];
    }

    // Category Filter
    if (category && mongoose.Types.ObjectId.isValid(category)) {
      match.category = new mongoose.Types.ObjectId(category);
    }

    // Plan Type Filter
    if (planType && mongoose.Types.ObjectId.isValid(planType)) {
      match.planType = new mongoose.Types.ObjectId(planType);
    }

    // -----------------------------
    // Aggregation Pipeline
    // -----------------------------
    const aggregationPipeline = [
      {
        $match: match,
      },

      // -----------------------------
      // Sort Early (better performance)
      // -----------------------------
      {
        $sort: {
          createdAt: -1,
        },
      },

      // -----------------------------
      // Facet
      // -----------------------------
      {
        $facet: {
          metadata: [
            {
              $count: "total",
            },
          ],

          data: [
            {
              $skip: skip,
            },

            {
              $limit: limit,
            },

            // -----------------------------
            // Category Lookup (optimized)
            // -----------------------------
            {
              $lookup: {
                from: "categories",
                let: {
                  categoryId: "$category",
                },

                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $eq: ["$_id", "$$categoryId"],
                      },
                    },
                  },

                  {
                    $project: {
                      _id: 1,
                      name: 1,
                      image: 1,
                      slug: 1,
                    },
                  },
                ],

                as: "category",
              },
            },

            {
              $unwind: {
                path: "$category",
                preserveNullAndEmptyArrays: true,
              },
            },

            // -----------------------------
            // Plan Type Lookup (optimized)
            // -----------------------------
            {
              $lookup: {
                from: "plantype",
                let: {
                  planTypeId: "$planType",
                },

                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $eq: ["$_id", "$$planTypeId"],
                      },
                    },
                  },

                  {
                    $project: {
                      _id: 1,
                      name: 1,
                      description: 1,
                    },
                  },
                ],

                as: "planType",
              },
            },

            {
              $unwind: {
                path: "$planType",
                preserveNullAndEmptyArrays: true,
              },
            },
            // -----------------------------
            // Booking Count Lookup (Last 30 days)
            // -----------------------------
            {
              $lookup: {
                from: "orders",
                let: { serviceId: "$_id" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ["$servicePlan", "$$serviceId"] },
                          { $gte: ["$createdAt", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)] }
                        ]
                      }
                    }
                  },
                  { $count: "count" }
                ],
                as: "recentBookings"
              }
            },

            // -----------------------------
            // Final Projection
            // -----------------------------
            {
              $project: {
                _id: 1,
                name: 1,
                subtitle: 1,
                price: 1,
                image: 1,
                duration: 1,
                features: 1,
                featuresFormatted: 1,
                createdAt: 1,
                category: 1,
                planType: 1,
                bookingCount30Days: { $ifNull: [{ $arrayElemAt: ["$recentBookings.count", 0] }, 0] }
              },
            },
          ],
        },
      },
    ];

    // -----------------------------
    // Execute Aggregation
    // -----------------------------
    const [results] = await ServicePlan.aggregate(
      aggregationPipeline
    ).allowDiskUse(true);

    const totalCount = results?.metadata?.[0]?.total || 0;

    // -----------------------------
    // Response
    // -----------------------------
    return res.status(200).json({
      success: true,

      data: results?.data || [],

      pagination: {
        totalCount,

        totalPages: Math.ceil(totalCount / limit),

        currentPage: page,

        limit,

        hasMore:
          skip + (results?.data?.length || 0) < totalCount,
      },
    });
  } catch (error) {
    console.error(
      "[ServiceController] Get all service plans error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};


export const editServicePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, subtitle, price, features, planType, category } = req.body;
    const file = req.file;

    // Prepare update object
    const updateData = { name, subtitle, price, features, planType, category };

    // Format features with bullet points if features are provided
    if (features) {
      const parsedFeatures = JSON.parse(features);
      const featuresFormatted = parsedFeatures.map(feature =>
        feature.startsWith('•') ? feature : `• ${feature}`
      );
      updateData.features = parsedFeatures;
      updateData.featuresFormatted = featuresFormatted;
    }

    // Only update image if a new file is provided
    if (file) {
      const uploadResult = await uploadToCloudinary(file.buffer, "servicePlans");
      updateData.image = uploadResult.url;
    }
    // If no file provided, image field is not included in updateData, so existing image is preserved

    const updatedServicePlan = await ServicePlan.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    return res.status(200).json({
      success: true,
      data: updatedServicePlan,
    });
  } catch (error) {
    console.error("Error updating service plan:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message
    });
  }
};

export const deleteService = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedServicePlan = await ServicePlan.findByIdAndDelete(id);
    return res.status(200).json({
      success: true,
      data: deletedServicePlan,
    });
  } catch (error) {
    console.error("Error deleting service plan:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message
    });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedCategory = await Category.findByIdAndDelete(id);
    return res.status(200).json({ success: true, data: deletedCategory });
  }
  catch (error) {
    console.error("Error deleting category:", error);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

export const editCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const file = req.file;
    const { name, description } = req.body;

    // Check if category exists
    const existingCategory = await Category.findById(id);
    if (!existingCategory) {
      return res.status(404).json({
        success: false,
        message: "Category not found"
      });
    }

    // Build update object dynamically
    const updateData = {};

    // Handle image upload if file is provided
    if (file) {
      const uploadResult = await uploadToCloudinary(file.buffer, "categories");
      updateData.image = uploadResult.url;
    }

    // Add fields to update only if they are provided in request body
    if (name !== undefined) {
      updateData.name = name;
    }
    if (description !== undefined) {
      updateData.description = description;
    }

    // Check if at least one field is being updated
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one field must be provided for update"
      });
    }

    // Update the category
    const updatedCategory = await Category.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: updatedCategory
    });
  }
  catch (error) {
    console.error("Error editing category:", error);

    // Handle specific validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: "Validation error",
        error: error.message
      });
    }

    // Handle duplicate key error (for unique fields)
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Category name already exists"
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};

export const getUserOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10, status, search } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Build query
    const query = { userId: userId };
    const filterConditions = [];

    if (status) {
      if (status === 'Ongoing') {
        filterConditions.push({
          $or: [
            { orderStatus: 'Accepted' },
            { work_status: 'In Progress' }
          ]
        });
      } else {
        filterConditions.push({ orderStatus: status });
      }
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filterConditions.push({
        $or: [
          { orderId: { $regex: searchRegex } },
          { 'bookingDetails.services.name': { $regex: searchRegex } }
        ]
      });
    }

    if (filterConditions.length > 0) {
      query.$and = filterConditions;
    }

    const totalCount = await Order.countDocuments(query);

    const orders = await Order.find(query)
      .populate({
        path: 'servicePlan',
        select: 'name subtitle price image features featuresFormatted category duration',
        populate: {
          path: 'category',
          select: 'name description image'
        }
      })
      .populate({
        path: 'servicePlans',
        select: 'name subtitle price image features featuresFormatted category duration',
        populate: {
          path: 'category',
          select: 'name description image'
        }
      })
      .populate('assignedEngineer', 'name mobile rating profileImage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const hasMore = skip + orders.length < totalCount;

    return res.status(200).json({
      success: true,
      message: 'User orders retrieved successfully',
      data: orders,
      count: orders.length,
      totalCount: totalCount,
      hasMore: hasMore,
      currentPage: parseInt(page)
    });

  } catch (error) {
    console.error('Error fetching user orders:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve user orders',
      error: error.message
    });
  }
};

export const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findByIdAndUpdate(
      id,
      {
        $set: { 
          orderStatus: 'Cancelled', 
          work_status: 'Cancelled', 
          status: 'cancelled',
          assignedEngineer: null // Unassign engineer
        },
        $push: {
          tracking: {
            status: 'CANCELLED',
            title: 'Booking Cancelled',
            subTitle: 'Cancelled by user',
            timestamp: new Date()
          }
        }
      },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Booking cancelled successfully',
      data: order
    });

    // 🔔 Notify User: Booking Cancelled
    if (order.userId) {
      notifyBookingUpdate(order.userId, order._id, 'BOOKING_CANCELLED', {
        serviceName: 'your requested service'
      }).catch(err => console.error('[ServiceController] Cancel notification failed:', err));
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const rescheduleBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const { scheduledAt, bookingDetails } = req.body;

    if (!scheduledAt) {
      return res.status(400).json({ success: false, message: 'New schedule time is required' });
    }

    const updateData = { scheduledAt };
    if (bookingDetails) {
      updateData.bookingDetails = bookingDetails;
    }

    const existingOrder = await Order.findById(id);
    if (!existingOrder) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // When rescheduling, reset the engineer assignment to dispatch it again
    updateData.assignedEngineer = null;
    updateData.acceptedBy = null;
    updateData.status = 'Searching';
    updateData.orderStatus = 'Upcoming';
    updateData.work_status = 'Upcoming';
    updateData.noShowPhase = 0;
    updateData.noShowPingedAt = null;

    // Build tracking array
    const trackingEvents = [];

    // 1. Reschedule Event
    const newTimeStr = scheduledAt ? new Date(scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const newDateStr = scheduledAt ? new Date(scheduledAt).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) : '';
    trackingEvents.push({
      status: 'RESCHEDULED',
      title: 'Booking Rescheduled',
      subTitle: `New slot: ${newDateStr}, ${newTimeStr}`,
      timestamp: new Date()
    });

    // 2. Reassignment Event (if someone was already assigned)
    if (existingOrder.assignedEngineer) {
      trackingEvents.push({
        status: 'SEARCHING_DELAYED',
        title: 'Partner Reassigned',
        subTitle: 'Finding a new expert for the new time',
        timestamp: new Date(Date.now() + 1000) // Slight offset for ordering
      });
    }

    // Ensure order is set back to Searching and unassigned
    const order = await Order.findByIdAndUpdate(
      id,
      {
        $set: {
          ...updateData,
          status: 'Searching',
          assignedEngineer: null,
          acceptedBy: null
        },
        $inc: { rescheduleCount: 1 },
        $push: { tracking: { $each: trackingEvents } }
      },
      { new: true }
    ).populate('servicePlan servicePlans');

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Trigger optimized re-dispatch
    const { dispatchOrder } = await import("../services/dispatch/dispatchService.js");
    dispatchOrder(order._id).catch(err => console.error('[Reschedule] Dispatch failed:', err));

    res.status(200).json({
      success: true,
      message: 'Booking rescheduled successfully',
      data: order
    });

    // 🔔 Notify User: Booking Rescheduled
    if (order.userId) {
      const newTimeStr = scheduledAt ? new Date(scheduledAt).toLocaleString() : 'a new time';
      notifyBookingUpdate(order.userId, order._id, 'BOOKING_RESCHEDULED', {
        serviceName: order.servicePlan?.name || 'Service',
        newTime: newTimeStr
      }).catch(err => console.error('[ServiceController] Reschedule notification failed:', err));
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllBookings = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate({
        path: 'servicePlan',
        select: 'name subtitle price image features category',
        populate: {
          path: 'category',
          select: 'name description image'
        }
      })
      .sort({ createdAt: -1 }) // Newest first
      .lean();

    // Check if any orders found
    if (!orders || orders.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No paid orders found',
        data: [],
        count: 0
      });
    }

    // Return orders
    return res.status(200).json({
      success: true,
      message: 'Paid orders retrieved successfully',
      data: orders,
      count: orders.length
    });

  } catch (error) {
    console.error('Error fetching user orders:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve user orders',
      error: error.message
    });
  }
};


export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    console.log(`[Admin] Updating Order ${id} to Status: ${status}`);

    const updateData = {};
    let trackingEntry = null;

    // --- Flow-Aware Status Synchronization ---
    // This ensures that updating one status field doesn't break the UI/logic in other apps (User/Engineer)
    switch (status) {
      case 'Arrived':
        updateData.orderStatus = 'Accepted';
        updateData.work_status = 'In Progress';
        trackingEntry = { status: 'ARRIVED', title: 'Partner Arrived', subTitle: 'Expert has reached your location', timestamp: new Date() };
        break;
      case 'Started':
        updateData.orderStatus = 'Accepted';
        updateData.work_status = 'In Progress';
        trackingEntry = { status: 'STARTED', title: 'Service Started', subTitle: 'Work is currently in progress', timestamp: new Date() };
        break;
      case 'Completed':
        updateData.orderStatus = 'Completed';
        updateData.work_status = 'Completed';
        updateData.status = 'completed'; // Sync lifecycle status
        trackingEntry = { status: 'COMPLETED', title: 'Service Completed', subTitle: 'Job finished successfully', timestamp: new Date() };
        break;
      case 'Cancelled':
        updateData.orderStatus = 'Cancelled';
        updateData.work_status = 'Cancelled';
        updateData.status = 'cancelled'; // Sync lifecycle status
        trackingEntry = { status: 'CANCELLED', title: 'Booking Cancelled', subTitle: 'Cancelled by Administrator', timestamp: new Date() };
        break;
      case 'Accepted':
        updateData.orderStatus = 'Accepted';
        updateData.work_status = 'Accepted';
        updateData.status = 'paid'; // Usually paid if accepted
        break;
      default:
        updateData.orderStatus = status;
        updateData.work_status = status;
    }

    const updateQuery = { $set: updateData };
    if (trackingEntry) {
      updateQuery.$push = { tracking: trackingEntry };
    }

    // Update the order status
    const updatedOrder = await Order.findByIdAndUpdate(
      id,
      updateQuery,
      { new: true }
    ).populate('servicePlan userId');

    if (!updatedOrder) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Order status updated and synchronized successfully",
      data: updatedOrder
    });

    // 🔔 Notify User: Status Updates
    if (updatedOrder.userId) {
      let eventKey = null;
      if (status === 'Arrived') eventKey = 'ENGINEER_ARRIVED';
      else if (status === 'Started') eventKey = 'JOB_STARTED';
      else if (status === 'Completed') eventKey = 'BOOKING_COMPLETED';
      else if (status === 'Cancelled') eventKey = 'BOOKING_CANCELLED';

      if (eventKey) {
        notifyBookingUpdate(updatedOrder.userId, updatedOrder._id, eventKey, {
          serviceName: updatedOrder.servicePlan?.name || 'Service',
          engineerName: 'Your engineer'
        }).catch(err => console.error('[ServiceController] Status notification failed:', err));
      }
    }
  } catch (error) {
    console.error("Error updating order status:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message
    });
  }
};


// --- ADMIN SPECIFIC BOOKING MANAGEMENT ---

/**
 * Optimized GET all bookings for Admin Dashboard
 * Supports: Server-side search, status filtering, and pagination via aggregation.
 */
export const getAllBookingsAdmin = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      status = 'all' 
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    const match = {};

    // 1. Search (Customer Name, OrderId, Phone)
    if (search) {
      match.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { 'customerDetails.name': { $regex: search, $options: 'i' } },
        { 'customerDetails.phone': { $regex: search, $options: 'i' } }
      ];
    }

    // 2. Status Filter
    if (status && status !== 'all') {
      if (status === 'CancelledPaid') {
        match.orderStatus = 'Cancelled';
        match.paymentStatus = { $in: ['PAID', 'paid'] };
      } else {
        match.orderStatus = status;
      }
    }

    // Execute Aggregation
    const [results] = await Order.aggregate([
      { $match: match },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          stats: [
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: "$amount" },
                upcomingCount: { $sum: { $cond: [{ $eq: ["$orderStatus", "Upcoming"] }, 1, 0] } },
                acceptedCount: { $sum: { $cond: [{ $eq: ["$orderStatus", "Accepted"] }, 1, 0] } },
                completedCount: { $sum: { $cond: [{ $eq: ["$orderStatus", "Completed"] }, 1, 0] } }
              }
            }
          ],
          data: [
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limitNum },
            {
              $lookup: {
                from: 'serviceplans',
                localField: 'servicePlan',
                foreignField: '_id',
                as: 'servicePlan'
              }
            },
            { $unwind: { path: '$servicePlan', preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: 'categories',
                localField: 'servicePlan.category',
                foreignField: '_id',
                as: 'servicePlan.category'
              }
            },
            { $unwind: { path: '$servicePlan.category', preserveNullAndEmptyArrays: true } },
            {
              $lookup: {
                from: 'engineers',
                localField: 'assignedEngineer',
                foreignField: '_id',
                as: 'assignedEngineer'
              }
            },
            { $unwind: { path: '$assignedEngineer', preserveNullAndEmptyArrays: true } }
          ]
        }
      }
    ]);

    const totalCount = results.metadata[0]?.total || 0;
    const globalStats = results.stats[0] || {
      totalRevenue: 0,
      upcomingCount: 0,
      acceptedCount: 0,
      completedCount: 0
    };

    return res.status(200).json({
      success: true,
      message: 'Admin bookings retrieved successfully',
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
    console.error('[ServiceController] Admin get bookings error:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve bookings', error: error.message });
  }
};

/**
 * Admin-specific order status update with flow synchronization and tracking cleanup.
 */
export const updateOrderStatusAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    console.log(`[Admin] Manual status update for Order ${id} to ${status}`);

    // Try regular Order first
    let existingOrder = await Order.findById(id);
    let isVendor = false;

    if (!existingOrder) {
      existingOrder = await VendorOrder.findById(id);
      isVendor = true;
    }

    if (!existingOrder) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // --- IMMUTABILITY CHECK ---
    const currentStatus = isVendor ? existingOrder.status : existingOrder.orderStatus;
    if (currentStatus === 'Completed' || currentStatus === 'COMPLETED' || currentStatus === 'Cancelled' || currentStatus === 'CANCELLED') {
      return res.status(400).json({ 
        success: false, 
        message: `This order is already ${currentStatus} and cannot be modified further.` 
      });
    }

    const updateData = {};
    let trackingEntry = null;
    let shouldCleanupTracking = false;

    if (isVendor) {
      // Vendor status mapping
      switch (status) {
        case 'Started':
          updateData.status = 'ACCEPTED';
          updateData.work_status = 'STARTED';
          trackingEntry = { status: 'STARTED', title: 'Work Started', subTitle: 'Expert has started the job', timestamp: new Date() };
          break;
        case 'Completed':
          updateData.status = 'COMPLETED';
          updateData.work_status = 'COMPLETED';
          updateData.completed_at = new Date();
          trackingEntry = { status: 'COMPLETED', title: 'Service Completed', subTitle: 'Job finished successfully', timestamp: new Date() };
          break;
        case 'Cancelled':
          updateData.status = 'CANCELLED';
          updateData.work_status = 'CANCELLED';
          updateData.assigned_engineer_id = null;
          trackingEntry = { status: 'CANCELLED', title: 'Booking Cancelled', subTitle: 'Cancelled by Administrator', timestamp: new Date() };
          break;
        case 'Accepted':
          updateData.status = 'ACCEPTED';
          updateData.work_status = 'NOT_STARTED';
          break;
        default:
          updateData.status = status;
          updateData.work_status = status;
      }

      const updatedOrder = await VendorOrder.findByIdAndUpdate(
        id,
        { $set: updateData, $push: trackingEntry ? { tracking: trackingEntry } : {} },
        { new: true }
      ).populate('assigned_engineer_id');

      return res.status(200).json({ success: true, message: "Vendor order updated successfully", data: updatedOrder });

    } else {
      // Regular Order status mapping
      switch (status) {
        case 'Arrived':
          updateData.orderStatus = 'Accepted';
          updateData.work_status = 'In Progress';
          trackingEntry = { status: 'ARRIVED', title: 'Partner Arrived', subTitle: 'Expert has reached your location', timestamp: new Date() };
          break;
        case 'Started':
          updateData.orderStatus = 'Accepted';
          updateData.work_status = 'In Progress';
          trackingEntry = { status: 'STARTED', title: 'Service Started', subTitle: 'Work is currently in progress', timestamp: new Date() };
          break;
        case 'Completed':
          updateData.orderStatus = 'Completed';
          updateData.work_status = 'Completed';
          updateData.status = 'completed';
          trackingEntry = { status: 'COMPLETED', title: 'Service Completed', subTitle: 'Job finished successfully', timestamp: new Date() };
          shouldCleanupTracking = true;
          break;
        case 'Cancelled':
          updateData.orderStatus = 'Cancelled';
          updateData.work_status = 'Cancelled';
          updateData.status = 'cancelled';
          updateData.assignedEngineer = null;
          trackingEntry = { status: 'CANCELLED', title: 'Booking Cancelled', subTitle: 'Cancelled by Administrator', timestamp: new Date() };
          shouldCleanupTracking = true;
          break;
        case 'Accepted':
          updateData.orderStatus = 'Accepted';
          updateData.work_status = 'Accepted';
          updateData.status = 'paid';
          break;
        default:
          updateData.orderStatus = status;
          updateData.work_status = status;
      }

      let updatedTracking = [...(existingOrder.tracking || [])];
      if (shouldCleanupTracking) {
        updatedTracking = updatedTracking.filter(t => 
          t.status !== 'SEARCHING_DELAYED' && 
          !t.title?.includes('Expert Not Found') &&
          !t.title?.includes('Searching')
        );
      }
      
      if (trackingEntry) {
        updatedTracking.push(trackingEntry);
      }

      const updatedOrder = await Order.findByIdAndUpdate(
        id,
        { $set: { ...updateData, tracking: updatedTracking } },
        { new: true }
      ).populate('servicePlan userId');

      res.status(200).json({ success: true, message: "Status synchronized successfully", data: updatedOrder });

      if (updatedOrder.userId) {
        let eventKey = null;
        if (status === 'Arrived') eventKey = 'ENGINEER_ARRIVED';
        else if (status === 'Started') eventKey = 'JOB_STARTED';
        else if (status === 'Completed') eventKey = 'BOOKING_COMPLETED';
        else if (status === 'Cancelled') eventKey = 'BOOKING_CANCELLED';

        if (eventKey) {
          notifyBookingUpdate(updatedOrder.userId, updatedOrder._id, eventKey, {
            serviceName: updatedOrder.servicePlan?.name || 'Service',
            engineerName: 'Your engineer'
          }).catch(err => console.error('[ServiceController] Admin status notification failed:', err));
        }
      }
    }
  } catch (error) {
    console.error("Admin order status update error:", error);
    return res.status(500).json({ success: false, message: "Internal server error", error: error.message });
  }
};

/**
 * Admin: GET all vendor bookings
 * Supports: Search, status filtering, and pagination.
 */
export const getAllVendorBookingsAdmin = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search = '', 
      status = 'all' 
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    const match = {};

    // 1. Search (Call ID, Project ID, Branch Name, Address)
    if (search) {
      match.$or = [
        { call_id: { $regex: search, $options: 'i' } },
        { projectId: { $regex: search, $options: 'i' } },
        { branch_name: { $regex: search, $options: 'i' } },
        { complete_address: { $regex: search, $options: 'i' } }
      ];
    }

    // 2. Status Filter
    if (status && status !== 'all') {
      match.status = status;
    }

    // Execute Aggregation
    const [results] = await VendorOrder.aggregate([
      { $match: match },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          stats: [
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: "$order_price" },
                pendingCount: { $sum: { $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0] } },
                acceptedCount: { $sum: { $cond: [{ $eq: ["$status", "ACCEPTED"] }, 1, 0] } },
                completedCount: { $sum: { $cond: [{ $eq: ["$status", "COMPLETED"] }, 1, 0] } }
              }
            }
          ],
          data: [
            { $sort: { created_at: -1 } },
            { $skip: skip },
            { $limit: limitNum },
            {
              $lookup: {
                from: 'engineers',
                localField: 'assigned_engineer_id',
                foreignField: '_id',
                as: 'assignedEngineer'
              }
            },
            { $unwind: { path: '$assignedEngineer', preserveNullAndEmptyArrays: true } }
          ]
        }
      }
    ]);

    const totalCount = results.metadata[0]?.total || 0;
    const globalStats = results.stats[0] || {
      totalRevenue: 0,
      pendingCount: 0,
      acceptedCount: 0,
      completedCount: 0
    };

    return res.status(200).json({
      success: true,
      message: 'Admin vendor bookings retrieved successfully',
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
    console.error('[ServiceController] Admin get vendor bookings error:', error);
    return res.status(500).json({ success: false, message: 'Failed to retrieve vendor bookings', error: error.message });
  }
};
