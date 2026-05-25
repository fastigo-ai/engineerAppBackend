import { getReverseGeoCache } from "./geoCache.service.js";

export const reverseGeocodeController = async (req, res) => {
  try {
    const { latitude, longitude } = req.query;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required',
      });
    }

    const address = await getReverseGeoCache(latitude, longitude);
    
    return res.status(200).json({
      success: true,
      address
    });
  } catch (error) {
    console.error('Reverse Geocode Error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error',
    });
  }
};

