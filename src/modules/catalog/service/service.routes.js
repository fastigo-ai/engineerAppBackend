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
  cancelBooking,
  rescheduleBooking,
  getAllServicePlansAdmin,
  getAllBookingsAdmin,
  updateOrderStatusAdmin,
  getAllVendorBookingsAdmin
} from './service.controller.js';
import upload from '../../../../middleware/multer.js';
import { bulkImportServices } from '../../../../repositories/serviceRepository.js';
import { authenticate, authorize } from '../../../../middleware/authMiddleWare.js';

const router = express.Router();

router.post('/plan/:planType/service', authenticate, authorize('admin', 'super_admin'), addServiceToPlanController);

router.post('/bulk', authenticate, authorize('admin', 'super_admin'), bulkAddServicesAllTypesController);

router.get('/all', getAllServicesController);

router.get('/plan/:planType', getServicesByPlanTypeController);

router.get('/service/:serviceId', getServiceByIdController);

router.get('/category/:category', getServicesByCategoryController);

router.post('/category', authenticate, authorize('admin', 'super_admin'), upload.single("image"), createCategoryController);

router.post('/createService', authenticate, authorize('admin', 'super_admin'), upload.single("image"), createServicePlanController);

router.get('/category', getAllCategoryController)

router.get('/trendingServices', getAllServicesController)

router.post('/bulkImport', authenticate, authorize('admin', 'super_admin'), bulkImportServices);

router.put("/categories/images", authenticate, authorize('admin', 'super_admin'), upload.array("images"), updateCategoryImages);

// Multiple service plans update
router.put("/servicePlans/images", authenticate, authorize('admin', 'super_admin'), upload.array("images"), updateServicePlanImages);

router.post('/createServicePlanType', authenticate, authorize('admin', 'super_admin'), createServicePlanType);

router.post('/createServicePlan', authenticate, authorize('admin', 'super_admin'), upload.single("image"), createServicePlan);

// Admin only route
router.post('/createCategory', authenticate, authorize('admin', 'super_admin'), upload.single("image"), createCategory);

router.get('/planTypes', getPlanTypes);

router.get('/admin/allServicesDashboard', authenticate, authorize('admin', 'super_admin'), getAllServicePlansAdmin);
router.get('/allServicesDashboard', getAllServicePlans);

router.put('/editServicePlan/:id', authenticate, authorize('admin', 'super_admin'), upload.single("image"), editServicePlan);

router.delete('/deleteService/:id', authenticate, authorize('admin', 'super_admin'), deleteService);

router.delete('/deleteCategory/:id', authenticate, authorize('admin', 'super_admin'), deleteCategory);

router.put('/editCategory/:id', authenticate, authorize('admin', 'super_admin'), upload.single("image"), editCategory);

router.get('/userOrders', authenticate, getUserOrders);

router.get('/allBookings', getAllBookings);

router.put('/updateOrderStatus/:id', updateOrderStatus);

router.put('/cancelBooking/:id', cancelBooking);

router.put('/rescheduleBooking/:id', rescheduleBooking);

// --- ADMIN BOOKING ROUTES ---
router.get('/admin/allBookings', authenticate, authorize('admin', 'super_admin'), getAllBookingsAdmin);
router.get('/admin/allVendorBookings', authenticate, authorize('admin', 'super_admin'), getAllVendorBookingsAdmin);
router.put('/admin/updateOrderStatus/:id', authenticate, authorize('admin', 'super_admin'), updateOrderStatusAdmin);

export default router;
