// config/cloudinary.js
import { v2 as cloudinary } from 'cloudinary';
import config from './config.js';

cloudinary.config({
  cloud_name: config.cloudinary.cloud_name,
  api_key: config.cloudinary.api_key,
  api_secret: config.cloudinary.api_secret,
});

// Test connection
(async () => {
  try {
    const result = await cloudinary.api.ping();
    console.log("✅ Cloudinary connected:", result.status); // should log "ok"
  } catch (error) {
    console.error("❌ Cloudinary connection failed:", error.message);
  }
})();

export default cloudinary;
