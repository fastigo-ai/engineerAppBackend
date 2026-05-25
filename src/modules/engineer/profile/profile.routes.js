import express from 'express';
import {
  addengineerController,
  getEngineersController,
  getEngineersAdminController,
  toggleEngineerBlockController,
  getEngineerDossierController,
  getAvialbleEngineersController,
  updateEngineerController,
  AssignEngineerToOrderController,
  unAssignEngineerFromOrderController,
  getEngineerDashboard
} from './engineer.controller.js';
import {
  getProfile,
  updateProfile
} from '../../auth/engineer/engineer.controller.js';
import { authenticate, authorize, authenticateEngineer } from '../../../middleware/authMiddleWare.js';

const router = express.Router();

router.post("/addEngineer", addengineerController);
router.get("/getEngineers", getEngineersController);
router.get("/admin/getEngineers", authenticate, authorize('admin', 'super_admin'), getEngineersAdminController);
router.put("/admin/toggleBlock/:id", authenticate, authorize('admin', 'super_admin'), toggleEngineerBlockController);
router.get("/admin/dossier/:id", authenticate, authorize('admin', 'super_admin'), getEngineerDossierController);
router.get("/getAvialbleEngineers", getAvialbleEngineersController);
router.put("/updateEngineer/:id", updateEngineerController);
router.put("/assignEngineerToOrder/:id", AssignEngineerToOrderController);
router.put("/unAssignEngineerFromOrder/:id", unAssignEngineerFromOrderController);
router.get("/dashboard", authenticateEngineer, getEngineerDashboard);
router.get("/profile", authenticateEngineer, getProfile);
router.put("/profile/update", authenticateEngineer, updateProfile);

export default router;
