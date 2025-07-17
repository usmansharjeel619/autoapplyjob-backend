const express = require("express");
const userController = require("../controllers/user.controller");
const { authenticate } = require("../middleware/auth.middleware");
const { uploadMiddleware } = require("../middleware/upload.middleware");
const {
  validationRules,
  handleValidationErrors,
} = require("../middleware/validation.middleware");

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Profile management
router.get("/profile", userController.getProfile);

router.put(
  "/profile",
  validationRules.updateProfile,
  handleValidationErrors,
  userController.updateProfile
);

// Resume upload
router.post(
  "/resume",
  uploadMiddleware.resume,
  uploadMiddleware.handleUploadError,
  userController.uploadResume
);

// Dashboard
router.get("/dashboard", userController.getDashboardStats);

// Jobs
router.get(
  "/jobs",
  validationRules.pagination,
  handleValidationErrors,
  userController.getJobs
);

router.get(
  "/saved-jobs",
  validationRules.pagination,
  handleValidationErrors,
  userController.getSavedJobs
);

router.post(
  "/saved-jobs/:jobId",
  validationRules.mongoId,
  handleValidationErrors,
  userController.saveJob
);

router.delete(
  "/saved-jobs/:jobId",
  validationRules.mongoId,
  handleValidationErrors,
  userController.unsaveJob
);

// Application history
router.get(
  "/applications",
  validationRules.pagination,
  handleValidationErrors,
  userController.getApplicationHistory
);

// Settings
router.get("/settings", userController.getSettings);

router.put("/settings", userController.updateSettings);

// Onboarding
router.post("/onboarding/:step", userController.completeOnboardingStep);

router.get("/onboarding/progress", userController.getOnboardingProgress);

module.exports = router;
