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
 import {Category} from "../models/categoryModal.js"
import { uploadToCloudinary } from '../utils/uploadToCloudinary.js';
import { ServicePlan } from '../models/serviceModal.js';
import { ServicePlans } from '../models/planModal.js';
import { Order } from '../models/orderSchema.js';
 


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
    console.log(services , "services");
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
    const categories = await getAllCategoryService();
    res.status(STATUS_CODES.SUCCESS).json({ 
      success: true, 
      data: categories, 
      message: 'All categories retrieved successfully' 
    });
  } catch (error) {
    const code = error.message.includes('not found') 
      ? STATUS_CODES.NOT_FOUND 
      : STATUS_CODES.INTERNAL_SERVER_ERROR;
    res.status(code).json({ success: false, message: error.message });
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
    const servicePlans = await ServicePlan.aggregate([
      // Lookup for category details
      {
        $lookup: {
          from: 'categories', // collection name in MongoDB
          localField: 'category',
          foreignField: '_id',
          as: 'categoryDetails'
        }
      },
      {
        $unwind: '$categoryDetails' // assuming each plan has 1 category
      },
      // Lookup for planType details
      {
        $lookup: {
          from: 'plantype', // collection name for ServicePlanType (adjust if different)
          localField: 'planType',
          foreignField: '_id',
          as: 'planTypeDetails'
        }
      },
      {
        $unwind: {
          path: '$planTypeDetails',
          preserveNullAndEmptyArrays: true // some plans may not have planType
        }
      },
      // Project desired fields
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
          planType: '$planTypeDetails'
        }
      }
    ]);

    res.status(200).json({ success: true, data: servicePlans });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
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
    console.log(userId , "userId");

    // Fetch only orders for the specific user
    const orders = await Order.find({ userId: userId })
      .populate({
        path: 'servicePlan',
        select: 'name subtitle price image features featuresFormatted category',
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
        message: 'No orders found for this user',
        data: [],
        count: 0
      });
    }

    // Return orders
    return res.status(200).json({
      success: true,
      message: 'User orders retrieved successfully',
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

    console.log(id , "id");
    console.log(status , "status");
    
    // Update the order status
    const updatedOrder = await Order.findByIdAndUpdate(
      id,
      { orderStatus: status },
      { new: true }
    ).populate('servicePlan', 'name subtitle price image features category')
     .populate('servicePlan.category', 'name description image')
     .populate('userId', 'name email mobile');

    if (!updatedOrder) {
      return res.status(404).json({
        success: false,
        message: "Order not found"
      });
    }

    // Format the response to match frontend expectations
    const formattedOrder = {
      _id: updatedOrder._id,
      orderId: updatedOrder.orderId,
      userId: updatedOrder.userId,
      servicePlan: updatedOrder.servicePlan,
      amount: updatedOrder.amount,
      currency: updatedOrder.currency,
      status: updatedOrder.status,
      razorpayOrderId: updatedOrder.razorpayOrderId,
      orderStatus: updatedOrder.orderStatus,
      customerDetails: updatedOrder.customerDetails,
      notes: updatedOrder.notes,
      receipt: updatedOrder.receipt,
      createdAt: updatedOrder.createdAt,
      updatedAt: updatedOrder.updatedAt,
      __v: updatedOrder.__v,
      bookingDetails: updatedOrder.bookingDetails,
      razorpayPaymentId: updatedOrder.razorpayPaymentId,
      razorpaySignature: updatedOrder.razorpaySignature
    };

    return res.status(200).json({
      success: true,
      message: "Order status updated successfully",
      data: formattedOrder
    });
  } catch (error) {
    console.error("Error updating order status:", error);
    return res.status(500).json({ 
      success: false,
      message: "Internal server error", 
      error: error.message 
    });
  }
};
