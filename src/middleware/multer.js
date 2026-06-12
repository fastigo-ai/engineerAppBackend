// middleware/multer.js
import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "../config/cloudinary.js";

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // Determine the folder based on the API route
    let folderName = 'general_uploads';
    if (req.originalUrl) {
      if (req.originalUrl.includes('complete')) folderName = 'order_completions';
      else if (req.originalUrl.includes('category')) folderName = 'categories';
      else if (req.originalUrl.includes('service')) folderName = 'servicePlans';
      else if (req.originalUrl.includes('auth')) folderName = 'profile_images';
      else if (req.originalUrl.includes('request')) folderName = 'order_completions';
    }

    return {
      folder: folderName,
      resource_type: "auto", // Automatically detects image/video/raw
    };
  },
});

const upload = multer({ storage });

export default upload;
