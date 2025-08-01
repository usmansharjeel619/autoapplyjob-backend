const express = require("express");
const userController = require("../controllers/user.controller");
const { authenticate } = require("../middleware/auth.middleware");
const {
  requirePayment,
  requireDashboardAccess,
} = require("../middleware/payment.middleware");
const { uploadMiddleware } = require("../middleware/upload.middleware");
const {
  validationRules,
  handleValidationErrors,
} = require("../middleware/validation.middleware");

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Profile management - no payment required
router.get("/profile", userController.getProfile);

router.put(
  "/profile",
  validationRules.updateProfile,
  handleValidationErrors,
  userController.updateProfile
);

// Resume upload - no payment required (basic feature)
router.post(
  "/resume",
  uploadMiddleware.resume,
  uploadMiddleware.handleUploadError,
  userController.uploadResume
);

// Dashboard - requires payment completion
router.get(
  "/dashboard",
  requireDashboardAccess,
  userController.getDashboardStats
);

// Jobs - requires payment
router.get(
  "/jobs",
  requirePayment,
  validationRules.pagination,
  handleValidationErrors,
  userController.getJobs
);

router.get(
  "/saved-jobs",
  requirePayment,
  validationRules.pagination,
  handleValidationErrors,
  userController.getSavedJobs
);

router.post(
  "/saved-jobs/:jobId",
  requirePayment,
  validationRules.mongoId,
  handleValidationErrors,
  userController.saveJob
);

router.delete(
  "/saved-jobs/:jobId",
  requirePayment,
  validationRules.mongoId,
  handleValidationErrors,
  userController.unsaveJob
);

// Application history - requires payment
router.get(
  "/applications",
  requirePayment,
  validationRules.pagination,
  handleValidationErrors,
  userController.getApplicationHistory
);

// Settings - no payment required
router.get("/settings", userController.getSettings);
router.put("/settings", userController.updateSettings);

// Onboarding - no payment required
router.post("/onboarding/:step", userController.completeOnboardingStep);
router.get("/onboarding/progress", userController.getOnboardingProgress);

module.exports = router;
