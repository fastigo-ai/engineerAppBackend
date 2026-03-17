import express from 'express';
import { login, register, onboardEngineer, updateFcmToken } from '../../controllers/engineerController/authController.js';


const router = express.Router();

router.post("/engineer/login", login);
router.post("/engineer/register", register);
router.post("/engineer/onboard", onboardEngineer);
router.post("/register-fcm-token", updateFcmToken);

export default router;
