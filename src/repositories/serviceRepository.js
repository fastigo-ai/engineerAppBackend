import { Category } from "../models/categoryModal.js";
import { ServicePlan } from "../models/serviceModal.js";
import { ServicePlans } from "../models/planModal.js";
import mongoose from 'mongoose';

export const addServiceToPlanRepository = async (planType, serviceData) => {
  // First, find or create the ServicePlans document for the planType
  let servicePlan = await ServicePlans.findOne({ planType });
  if (!servicePlan) {
    servicePlan = await ServicePlans.create({ planType });
  }

  // Create the new service with reference to the ServicePlans document
  const newService = await ServicePlan.create({
    ...serviceData,
    planType: servicePlan._id
  });

  return newService;
};

export const bulkAddServicesAllTypesRepository = async (servicesData) => {
  const results = {};

  if (servicesData.booking && Array.isArray(servicesData.booking)) {
    // Find or create Booking ServicePlans document
    let bookingPlan = await ServicePlans.findOne({ planType: 'Booking' });
    if (!bookingPlan) {
      bookingPlan = await ServicePlans.create({ planType: 'Booking' });
    }

    // Create all booking services
    const bookingServices = await ServicePlan.insertMany(
      servicesData.booking.map(service => ({
        ...service,
        planType: bookingPlan._id
      }))
    );
    results.Booking = bookingServices;
  }

  if (servicesData.quick && Array.isArray(servicesData.quick)) {
    // Find or create Quick ServicePlans document
    let quickPlan = await ServicePlans.findOne({ planType: 'Quick' });
    if (!quickPlan) {
      quickPlan = await ServicePlans.create({ planType: 'Quick' });
    }

    // Create all quick services
    const quickServices = await ServicePlan.insertMany(
      servicesData.quick.map(service => ({
        ...service,
        planType: quickPlan._id
      }))
    );
    results.Quick = quickServices;
  }

  return results;
};

export const getAllServicesRepository = async () => {
  return ServicePlan.aggregate([
    // Join plan type details
    {
      $lookup: {
        from: 'plantype', // matches ServicePlans collection
        localField: 'planType',
        foreignField: '_id',
        as: 'planDetails'
      }
    },
    { $unwind: '$planDetails' },

    // Join category details
    {
      $lookup: {
        from: 'categories',
        localField: 'category',
        foreignField: '_id',
        as: 'categoryDetails'
      }
    },
    { $unwind: '$categoryDetails' },

    // Project final structure
    {
      $project: {
        serviceId: '$_id',
        name: 1,
        subtitle: 1,
        price: 1,
        image: 1,
        features: 1,
        featuresFormatted: 1,
        planType: '$planDetails.planType',
        category: {
          id: '$categoryDetails._id',
          name: '$categoryDetails.name',
          description: '$categoryDetails.description',
          image: '$categoryDetails.image'
        }
      }
    }
  ]);
};


export const getServicesByPlanTypeRepository = async (planType) => {
  const servicePlan = await ServicePlans.findOne({ planType });
  if (!servicePlan) {
    return null;
  }

  return ServicePlan.aggregate([
    {
      $match: { planType: servicePlan._id }
    },
    {
      $lookup: {
        from: 'categories',
        localField: 'category',
        foreignField: '_id',
        as: 'categoryDetails'
      }
    },
    {
      $unwind: '$categoryDetails'
    },
    {
      $group: {
        _id: null,
        planType: { $first: planType },
        services: {
          $push: {
            serviceId: '$_id',
            name: '$name',
            subtitle: '$subtitle',
            price: '$price',
            features: '$features',
            category: {
              id: '$categoryDetails._id',
              name: '$categoryDetails.name',
              description: '$categoryDetails.description'
            }
          }
        }
      }
    },
    {
      $project: {
        _id: 0,
        planType: 1,
        services: 1
      }
    }
  ]);
};

export const getServiceByIdRepository = async (serviceId) => {
  return ServicePlan.aggregate([
    {
      $match: { _id: new mongoose.Types.ObjectId(serviceId) }
    },
    {
      $lookup: {
        from: 'servicePlans',
        localField: 'planType',
        foreignField: '_id',
        as: 'planDetails'
      }
    },
    {
      $lookup: {
        from: 'categories',
        localField: 'category',
        foreignField: '_id',
        as: 'categoryDetails'
      }
    },
    {
      $unwind: '$planDetails'
    },
    {
      $unwind: '$categoryDetails'
    },
    {
      $project: {
        serviceId: '$_id',
        planType: '$planDetails.planType',
        name: '$name',
        subtitle: '$subtitle',
        price: '$price',
        features: '$features',
        category: {
          id: '$categoryDetails._id',
          name: '$categoryDetails.name',
          description: '$categoryDetails.description'
        }
      }
    }
  ]);
};

export const getServicesByCategoryRepository = async (categoryId) => {
  return ServicePlan.aggregate([
    {
      $match: { category: new mongoose.Types.ObjectId(categoryId) }
    },
    {
      $lookup: {
        from: 'plantype', // Correct collection name
        localField: 'planType',
        foreignField: '_id',
        as: 'planDetails'
      }
    },
    {
      $lookup: {
        from: 'categories',
        localField: 'category',
        foreignField: '_id',
        as: 'categoryDetails'
      }
    },
    {
      $unwind: '$planDetails'
    },
    {
      $unwind: '$categoryDetails'
    },
    {
      $group: {
        _id: '$planDetails.planType', // Group by planType string ('Booking' or 'Quick')
        category: {
          $first: {
            id: '$categoryDetails._id',
            name: '$categoryDetails.name',
            description: '$categoryDetails.description'
          }
        },
        services: {
          $push: {
            serviceId: '$_id',
            name: '$name',
            image: '$image',
            subtitle: '$subtitle',
            price: '$price',
            features: '$features'
          }
        }
      }
    },
    {
      $project: {
        planType: '$_id',
        category: 1,
        services: 1,
        _id: 0
      }
    }
  ]);
};


export const createCategoryRepository = async (data) => {
  try {
    const category = new Category(data);
    return await category.save();
  } catch (error) {
    if (error.code === 11000) {
      throw new Error("Category name already exists");
    }
    throw error;
  }
};

export const createServicePlanRepository = async (data) => {
  try {
    const servicePlan = new ServicePlan(data);
    return await servicePlan.save();
  } catch (error) {
    if (error.code === 11000) {
      throw new Error("Service plan already exists");
    }
    throw error;
  }
};

export const getAllCategoryRepository = async () => {
  return Category.find();
}

export const bulkImportServices = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    await session.startTransaction();
    
    const serviceData = req.body;
    
    // Validate input
    if (!Array.isArray(serviceData) || serviceData.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid data format. Expected array of categories.'
      });
    }

    const results = {
      categoriesCreated: 0,
      planTypesCreated: 0,
      servicesCreated: 0,
      errors: []
    };

    // Process each category
    for (const categoryData of serviceData) {
      try {
        // Create or find category
        let category = await Category.findOne({ name: categoryData.name }).session(session);
        
        if (!category) {
          category = new Category({
            name: categoryData.name,
            description: categoryData.description || '',
            image: categoryData.image || ''
          });
          await category.save({ session });
          results.categoriesCreated++;
        }

        // Process plan types for this category
        if (categoryData.planTypes && Array.isArray(categoryData.planTypes)) {
          for (const planTypeData of categoryData.planTypes) {
            try {
              // Create or find plan type
              let planType = await ServicePlans.findOne({ 
                planType: planTypeData.planType 
              }).session(session);
              
              if (!planType) {
                planType = new ServicePlans({
                  planType: planTypeData.planType
                });
                await planType.save({ session });
                results.planTypesCreated++;
              }

              // Process services for this plan type
              if (planTypeData.services && Array.isArray(planTypeData.services)) {
                for (const serviceData of planTypeData.services) {
                  try {
                    // Check if service already exists for this category and plan type
                    const existingService = await ServicePlan.findOne({
                      name: serviceData.name,
                      category: category._id,
                      planType: planType._id
                    }).session(session);

                    if (!existingService) {
                      const service = new ServicePlan({
                        name: serviceData.name,
                        subtitle: serviceData.subtitle || '',
                        price: serviceData.price || 0,
                        image: serviceData.image || '',
                        features: serviceData.features || [],
                        planType: planType._id,
                        category: category._id
                      });
                      
                      await service.save({ session });
                      results.servicesCreated++;
                    }
                  } catch (serviceError) {
                    results.errors.push({
                      type: 'service',
                      category: categoryData.name,
                      planType: planTypeData.planType,
                      service: serviceData.name,
                      error: serviceError.message
                    });
                  }
                }
              }
            } catch (planTypeError) {
              results.errors.push({
                type: 'planType',
                category: categoryData.name,
                planType: planTypeData.planType,
                error: planTypeError.message
              });
            }
          }
        }
      } catch (categoryError) {
        results.errors.push({
          type: 'category',
          category: categoryData.name,
          error: categoryError.message
        });
      }
    }

    await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: 'Bulk import completed successfully',
      results: {
        categoriesCreated: results.categoriesCreated,
        planTypesCreated: results.planTypesCreated,
        servicesCreated: results.servicesCreated,
        totalErrors: results.errors.length,
        errors: results.errors
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Bulk import error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to import data',
      error: error.message
    });
  } finally {
    await session.endSession();
  }
};
