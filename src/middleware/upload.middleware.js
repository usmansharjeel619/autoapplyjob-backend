const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { ApiResponse } = require("../utils/apiResponse");

// Create uploads directory if it doesn't exist
const uploadsDir = process.env.UPLOAD_PATH || "./uploads";
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = uploadsDir;

    // Create subfolder based on file type
    if (file.fieldname === "resume") {
      uploadPath = path.join(uploadsDir, "resumes");
    } else if (file.fieldname === "profilePicture") {
      uploadPath = path.join(uploadsDir, "profiles");
    }

    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Generate unique filename
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname);
    const filename = `${file.fieldname}-${uniqueSuffix}${extension}`;
    cb(null, filename);
  },
});

// File filter function
const fileFilter = (req, file, cb) => {
  const allowedTypes = {
    resume: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
    profilePicture: ["image/jpeg", "image/png", "image/webp"],
  };

  const allowedExtensions = {
    resume: [".pdf", ".doc", ".docx"],
    profilePicture: [".jpg", ".jpeg", ".png", ".webp"],
  };

  const fieldAllowedTypes = allowedTypes[file.fieldname] || [];
  const fieldAllowedExtensions = allowedExtensions[file.fieldname] || [];
  const fileExtension = path.extname(file.originalname).toLowerCase();

  if (
    fieldAllowedTypes.includes(file.mimetype) &&
    fieldAllowedExtensions.includes(fileExtension)
  ) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type for ${
          file.fieldname
        }. Allowed types: ${fieldAllowedExtensions.join(", ")}`
      ),
      false
    );
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB default
    files: 1,
  },
  fileFilter: fileFilter,
});

// Middleware for different upload types
const uploadMiddleware = {
  // Single resume upload
  resume: upload.single("resume"),

  // Single profile picture upload
  profilePicture: upload.single("profilePicture"),

  // Multiple files (if needed in future)
  multiple: upload.array("files", 5),

  // Handle upload errors
  handleUploadError: (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return ApiResponse.badRequest(
          res,
          "File size too large. Maximum size is 5MB."
        );
      } else if (err.code === "LIMIT_FILE_COUNT") {
        return ApiResponse.badRequest(res, "Too many files uploaded.");
      } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
        return ApiResponse.badRequest(res, "Unexpected file field.");
      }
      return ApiResponse.badRequest(res, `Upload error: ${err.message}`);
    } else if (err) {
      return ApiResponse.badRequest(res, err.message);
    }
    next();
  },
};

// Clean up old files (utility function)
const cleanupOldFiles = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      console.error("Error deleting old file:", error);
    }
  }
};

module.exports = {
  uploadMiddleware,
  cleanupOldFiles,
};
