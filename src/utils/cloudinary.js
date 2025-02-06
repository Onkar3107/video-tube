import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const uploadOnCloudinary = async (localFilePath) => {
  try {
    if (!localFilePath) {
      // throw new Error('File path is required');
      return null;
    }
    // Upload file to cloudinary
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });
    // File uploaded successfully
    console.log("File uploaded successfully", response, response.url);
    return response;
  } catch (error) {
    fs.unlinkSync(localFilePath); // Delete the temp file from local storage as upload ops failed
    return null;
  }
};
