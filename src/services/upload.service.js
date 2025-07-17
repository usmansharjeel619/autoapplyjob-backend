const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

class UploadService {
  // Upload file to Cloudinary
  async uploadFile(file, options = {}) {
    try {
      const uploadOptions = {
        resource_type: "auto",
        folder: options.folder || "autoapplyjob",
        public_id: options.public_id,
        overwrite: options.overwrite || false,
        ...options,
      };

      // Determine file type for specific handling
      if (file.mimetype.startsWith("image/")) {
        uploadOptions.transformation = [
          { width: 500, height: 500, crop: "limit" },
          { quality: "auto" },
          { fetch_format: "auto" },
        ];
      }

      const result = await cloudinary.uploader.upload(file.path, uploadOptions);

      logger.info(`File uploaded to Cloudinary: ${result.public_id}`);
      return result;
    } catch (error) {
      logger.error("Cloudinary upload error:", error);
      throw new Error(`File upload failed: ${error.message}`);
    }
  }

  // Delete file from Cloudinary
  async deleteFile(publicId) {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      logger.info(`File deleted from Cloudinary: ${publicId}`);
      return result;
    } catch (error) {
      logger.error("Cloudinary delete error:", error);
      throw new Error(`File deletion failed: ${error.message}`);
    }
  }

  // Upload resume specifically
  async uploadResume(file, userId) {
    const options = {
      folder: "autoapplyjob/resumes",
      public_id: `resume_${userId}_${Date.now()}`,
      resource_type: "raw", // For PDF/DOC files
    };

    return await this.uploadFile(file, options);
  }

  // Upload profile picture
  async uploadProfilePicture(file, userId) {
    const options = {
      folder: "autoapplyjob/profiles",
      public_id: `profile_${userId}_${Date.now()}`,
      transformation: [
        { width: 300, height: 300, crop: "fill" },
        { quality: "auto" },
        { fetch_format: "auto" },
      ],
    };

    return await this.uploadFile(file, options);
  }

  // Get file info from Cloudinary
  async getFileInfo(publicId) {
    try {
      const result = await cloudinary.api.resource(publicId);
      return result;
    } catch (error) {
      logger.error("Error getting file info:", error);
      throw new Error(`Failed to get file info: ${error.message}`);
    }
  }

  // Generate signed URL for temporary access
  generateSignedUrl(publicId, options = {}) {
    const defaultOptions = {
      expires_at: Math.floor(Date.now() / 1000) + 3600, // 1 hour
      ...options,
    };

    return cloudinary.utils.private_download_zip_url({
      public_ids: [publicId],
      ...defaultOptions,
    });
  }

  // Validate file type
  validateFileType(file, allowedTypes) {
    if (!allowedTypes.includes(file.mimetype)) {
      throw new Error(
        `Invalid file type. Allowed types: ${allowedTypes.join(", ")}`
      );
    }
    return true;
  }

  // Validate file size
  validateFileSize(file, maxSize) {
    if (file.size > maxSize) {
      throw new Error(`File too large. Maximum size: ${maxSize} bytes`);
    }
    return true;
  }

  // Clean up local file
  cleanupLocalFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        logger.debug(`Local file cleaned up: ${filePath}`);
      }
    } catch (error) {
      logger.warn(`Failed to cleanup local file: ${filePath}`, error);
    }
  }

  // Process and upload multiple files
  async uploadMultipleFiles(files, options = {}) {
    const uploadPromises = files.map((file) => this.uploadFile(file, options));

    try {
      const results = await Promise.allSettled(uploadPromises);

      const successful = results
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value);

      const failed = results
        .filter((result) => result.status === "rejected")
        .map((result) => result.reason);

      return { successful, failed };
    } catch (error) {
      logger.error("Multiple file upload error:", error);
      throw error;
    }
  }
}

module.exports = new UploadService();
