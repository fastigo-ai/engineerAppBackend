import categoryRoutes from './category/category.routes.js';
import planRoutes from './plan/plan.routes.js';
import serviceRoutes from './service/service.routes.js';
import express from 'express';

const router = express.Router();

router.use('/', categoryRoutes);
router.use('/', planRoutes);
router.use('/', serviceRoutes);

export default router;
