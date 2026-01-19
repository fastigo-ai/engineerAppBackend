import express from 'express';
import {
  addServiceToPlanController,
  bulkAddServicesAllTypesController,
  getAllServicesController,
  getServicesByPlanTypeController,
  getServiceByIdController,
  getServicesByCategoryController,
  createCategoryController,
  createServicePlanController,
  getAllCategoryController,
  updateCategoryImages,
  updateServicePlanImages,
  createServicePlanType,
  createServicePlan,
  createCategory,
  getPlanTypes,
  getAllServicePlans,
  editServicePlan,
  deleteService,
  deleteCategory,
  editCategory,
  getUserOrders,
  getAllBookings,
  updateOrderStatus,
  } from '../controllers/serviceController.js';
import upload from '../middleware/multer.js';
import { bulkImportServices } from '../repositories/serviceRepository.js';
import { authenticate } from '../middleware/authMiddleWare.js';

const router = express.Router();

router.post('/plan/:planType/service', addServiceToPlanController);

router.post('/bulk', bulkAddServicesAllTypesController);

router.get('/all', getAllServicesController);

router.get('/plan/:planType', getServicesByPlanTypeController);

router.get('/service/:serviceId', getServiceByIdController);

router.get('/category/:category', getServicesByCategoryController);

router.post('/category', upload.single("image"),  createCategoryController);

router.post('/createService', upload.single("image"), createServicePlanController);

router.get('/category', getAllCategoryController)

router.get('/trendingServices', getAllServicesController)

router.post('/bulkImport', bulkImportServices);

router.put("/categories/images", upload.array("images"), updateCategoryImages);

// Multiple service plans update
router.put("/servicePlans/images", upload.array("images"), updateServicePlanImages);

router.post('/createServicePlanType', createServicePlanType);

router.post('/createServicePlan', upload.single("image"), createServicePlan);

router.post('/createCategory', upload.single("image"), createCategory);

router.get('/planTypes', getPlanTypes);

router.get('/allServicesDashboard',   getAllServicePlans);

router.put('/editServicePlan/:id', upload.single("image"), editServicePlan);

router.delete('/deleteService/:id', deleteService);

router.delete('/deleteCategory/:id', deleteCategory);

router.put('/editCategory/:id', upload.single("image"), editCategory);

router.get('/userOrders', authenticate, getUserOrders);

router.get('/allBookings', getAllBookings);

router.put('/updateOrderStatus/:id', updateOrderStatus);

export default router;