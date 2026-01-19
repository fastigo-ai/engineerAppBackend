import express from 'express';
import { login, register, onboardEngineer } from '../../controllers/engineerController/authController.js';


const router = express.Router();

router.post("/engineer/login", login);
router.post("/engineer/register", register);
router.post("/engineer/onboard", onboardEngineer); // Called by FastAPI after approval

export default router;
