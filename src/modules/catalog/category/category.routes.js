import express from 'express';
import {
  createCategoryController,
  getAllCategoryController,
  updateCategoryImages,
  createCategory,
  deleteCategory,
  editCategory
} from './category.controller.js';
import upload from '../../../middleware/multer.js';
import { authenticate, authorize } from '../../../middleware/authMiddleWare.js';

const router = express.Router();

router.post('/category', authenticate, authorize('admin', 'super_admin'), upload.single("image"), createCategoryController);
router.post('/createCategory', authenticate, authorize('admin', 'super_admin'), upload.single("image"), createCategory);
router.get('/category', getAllCategoryController);
router.put('/categories/images', authenticate, authorize('admin', 'super_admin'), upload.array("images"), updateCategoryImages);
router.delete('/deleteCategory/:id', authenticate, authorize('admin', 'super_admin'), deleteCategory);
router.put('/editCategory/:id', authenticate, authorize('admin', 'super_admin'), upload.single("image"), editCategory);

export default router;
