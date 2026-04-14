import express from 'express';
import { reverseGeocodeController } from '../controllers/mapController.js';

const router = express.Router();

router.get('/reverse-geocode', reverseGeocodeController);

export default router;
