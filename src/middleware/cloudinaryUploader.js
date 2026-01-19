// middleware/cloudinaryUploader.js
import { uploadToCloudinary } from '../utils/uploadToCloudinary.js';

export const cloudinaryUploader = (folder = 'uploads') => {
  return async (req, res, next) => {
    try {
      if (!req.files || Object.keys(req.files).length === 0) {
        return next();
      }

      const fileEntries = Array.isArray(req.files)
        ? req.files
        : Object.values(req.files).flat();

      for (const file of fileEntries) {
        const { secure_url } = await uploadToCloudinary(file.path, folder);

        // Attach only the public URL to req.body
        if (!req.body[file.fieldname]) {
          req.body[file.fieldname] = secure_url;
        } else {
          if (!Array.isArray(req.body[file.fieldname])) {
            req.body[file.fieldname] = [req.body[file.fieldname]];
          }
          req.body[file.fieldname].push(secure_url);
        }
      }

      next();
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, error: err.message });
    }
  };
};
