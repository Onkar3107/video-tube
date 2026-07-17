import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import { logger } from '../config/logger.js';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export { cloudinary };

export const uploadOnCloudinary = async (localFilePath: string | undefined) => {
  try {
    if (!localFilePath) {
      return null;
    }
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: 'auto',
    });
    fs.unlinkSync(localFilePath);
    return response;
  } catch (error) {
    logger.error({ err: error }, 'Cloudinary upload error');
    if (localFilePath && fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }
    return null;
  }
};

export const deleteFromCloudinary = async (fileUrl: string | undefined) => {
  try {
    if (!fileUrl) return null;
    const urlParts = fileUrl.split('/upload/');
    if (urlParts.length < 2) return null;
    const withVersion = urlParts[1]!;
    const withoutVersion = withVersion.replace(/^v\d+\//, '');
    const publicId = withoutVersion.replace(/\.[^.]+$/, '');
    const response = await cloudinary.uploader.destroy(publicId);
    return response;
  } catch (error) {
    logger.error({ err: error }, 'Cloudinary delete error');
    return null;
  }
};
