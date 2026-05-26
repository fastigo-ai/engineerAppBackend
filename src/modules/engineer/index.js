import express from 'express';
import profileRoutes from './profile/profile.routes.js';
import locationRoutes from './location/location.routes.js';
import requestsRoutes from './requests/requests.routes.js';
import vendorRequestsRoutes from '../vendorOrder/index.js';
import financeRoutes from './finance/finance.routes.js';

const router = express.Router();

router.use('/', profileRoutes);
router.use('/', locationRoutes);
router.use('/', requestsRoutes);
router.use('/', vendorRequestsRoutes);
router.use('/', financeRoutes);

export default router;
