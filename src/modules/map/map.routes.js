import express from 'express';
import { reverseGeocodeController } from "./map.controller.js";

const router = express.Router();

router.get('/reverse-geocode', reverseGeocodeController);

export default router;
