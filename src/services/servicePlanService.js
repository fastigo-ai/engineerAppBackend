import { 
  addServiceToPlanRepository,
  bulkAddServicesAllTypesRepository,
  getAllServicesRepository,
  getServicesByPlanTypeRepository,
  getServiceByIdRepository,
  getServicesByCategoryRepository,
  createCategoryRepository,
  createServicePlanRepository,
  getAllCategoryRepository
} from "../repositories/serviceRepository.js";
import { Category } from "../models/categoryModal.js";
import mongoose from 'mongoose';
import { uploadToCloudinary } from "../utils/uploadToCloudinary.js";

export const addServiceToPlanService = async (planType, serviceData) => {
  if (!planType || !serviceData) {
    throw new Error('Plan type and service data are required');
  }

  if (!['Booking', 'Quick'].includes(planType)) {
    throw new Error('Invalid plan type. Must be "Booking" or "Quick"');
  }

  const { name, subtitle, price, features, category } = serviceData;
  
  if (!name || !subtitle || price === undefined || !features || !category) {
    throw new Error('Service name, subtitle, price, features, and category are required');
  }

  if (!Array.isArray(features) || features.length === 0) {
    throw new Error('Features must be a non-empty array');
  }

  if (price < 0) {
    throw new Error('Price must be non-negative');
  }

  let categoryId;

  if (mongoose.Types.ObjectId.isValid(category)) {
    // If valid ObjectId, check if category exists
    const categoryExists = await Category.findById(category);
    if (!categoryExists) {
      throw new Error('Category not found');
    }
    categoryId = category;
  } else if (typeof category === 'string') {
    // If category is name, create new category if not exists
    let categoryDoc = await Category.findOne({ name: category.trim() });
    if (!categoryDoc) {
      categoryDoc = await Category.create({ name: category.trim() });
    }
    categoryId = categoryDoc._id;
  } else {
    throw new Error('Invalid category format');
  }

  return await addServiceToPlanRepository(planType, { ...serviceData, category: categoryId });
};


export const bulkAddServicesAllTypesService = async (servicesData) => {
  if (!servicesData || typeof servicesData !== 'object') {
    throw new Error('Services data object is required');
  }

  if (!servicesData.booking && !servicesData.quick) {
    throw new Error('At least one of booking or quick services array is required');
  }

  const processServices = async (services, planType) => {
    const processedServices = [];

    for (const service of services) {
      const { name, subtitle, price, features, category } = service;

      if (!name || !subtitle || price === undefined || !features || !category) {
        throw new Error(`Each ${planType} service must have name, subtitle, price, features, and category`);
      }

      if (!Array.isArray(features) || features.length === 0) {
        throw new Error(`Each ${planType} service features must be a non-empty array`);
      }

      if (price < 0) {
        throw new Error(`Each ${planType} service price must be non-negative`);
      }

      let categoryId;

      if (mongoose.Types.ObjectId.isValid(category)) {
        // If category is an ObjectId, ensure it exists
        const categoryExists = await Category.findById(category);
        if (!categoryExists) {
          throw new Error(`Category not found for ${planType} service: ${name}`);
        }
        categoryId = category;
      } else if (typeof category === 'string') {
        // Create a new category if name is given
        const newCategory = await Category.create({ name: category.trim() });
        categoryId = newCategory._id;
      } else {
        throw new Error(`Invalid category format for ${planType} service: ${name}`);
      }

      processedServices.push({ ...service, category: categoryId });
    }

    return processedServices;
  };

  const processedData = {};

  if (servicesData.booking && Array.isArray(servicesData.booking)) {
    processedData.booking = await processServices(servicesData.booking, 'booking');
  }

  if (servicesData.quick && Array.isArray(servicesData.quick)) {
    processedData.quick = await processServices(servicesData.quick, 'quick');
  }

  return await bulkAddServicesAllTypesRepository(processedData);
};


export const getAllServicesService = async () => {
  const result = await getAllServicesRepository();
  console.log(result , "result");
  if (!result || result.length === 0 || !result) {
    throw new Error('No services found');
  }
  return result;
};

export const getServicesByPlanTypeService = async (planType) => {
  if (!planType) {
    throw new Error('Plan type is required');
  }

  if (!['Booking', 'Quick'].includes(planType)) {
    throw new Error('Invalid plan type. Must be "Booking" or "Quick"');
  }

  const result = await getServicesByPlanTypeRepository(planType);
  if (!result || result.length === 0) {
    throw new Error(`No ${planType} services found`);
  }

  return result[0];
};

export const getServiceByIdService = async (serviceId) => {
  if (!serviceId) {
    throw new Error('Service ID is required');
  }

  if (!mongoose.Types.ObjectId.isValid(serviceId)) {
    throw new Error('Invalid service ID format');
  }

  const result = await getServiceByIdRepository(serviceId);
  if (!result || result.length === 0) {
    throw new Error('Service not found');
  }

  return result[0];
};

export const getServicesByCategoryService = async (categoryInput) => {
  if (!categoryInput) {
    throw new Error('Category is required');
  }

  let categoryId;
  
  // Check if input is already an ObjectId
  if (mongoose.Types.ObjectId.isValid(categoryInput)) {
    categoryId = categoryInput;
  } else {
    // If it's a string, find the category by name
    const category = await Category.findOne({ name: categoryInput });
    if (!category) {
      throw new Error(`Category '${categoryInput}' not found`);
    }
    categoryId = category._id;
  }

  const result = await getServicesByCategoryRepository(categoryId);
  if (!result || result.length === 0) {
    throw new Error(`No services found for category: ${categoryInput}`);
  }

  return result;
};


export const createCategoryService = async (data, file) => {
  let imageUrl = null;

  if (file) {
    const result = await uploadToCloudinary(file.buffer, "categories");
    imageUrl = result.url;
  }

  const category = await createCategoryRepository({
    ...data,
    image: imageUrl,
  });

  return category;
};


export const createServicePlanService = async (data, file) => {
  let imageUrl = null;

  if (file) {
    const result = await uploadToCloudinary(file.buffer, "servicePlans");
    imageUrl = result.url;
  }

  const servicePlan = await createServicePlanRepository({
    name: data.name,
    subtitle: data.subtitle,
    price: data.price,
    image: imageUrl,
    features: data.features,          // expecting array of strings
    planType: data.planType || null,  // optional
    category: data.category,          // required
  });

  return servicePlan;
};

export const getAllCategoryService = async () => {
  return getAllCategoryRepository();
};
