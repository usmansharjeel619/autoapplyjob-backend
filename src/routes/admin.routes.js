const express = require("express");
const adminController = require("../controllers/admin.controller");
const { authenticate, requireAdmin } = require("../middleware/auth.middleware");
const {
  validationRules,
  handleValidationErrors,
} = require("../middleware/validation.middleware");

const router = express.Router();

// All routes require admin authentication
router.use(authenticate, requireAdmin);

// Dashboard
router.get("/dashboard", adminController.getDashboardStats);

// User management
router.get(
  "/users",
  validationRules.pagination,
  handleValidationErrors,
  adminController.getAllUsers
);

router.get(
  "/users/:userId",
  validationRules.mongoId,
  handleValidationErrors,
  adminController.getUser
);

router.put(
  "/users/:userId",
  validationRules.mongoId,
  handleValidationErrors,
  adminController.updateUser
);

router.patch(
  "/users/:userId/deactivate",
  validationRules.mongoId,
  handleValidationErrors,
  adminController.deactivateUser
);

router.patch(
  "/users/:userId/reactivate",
  validationRules.mongoId,
  handleValidationErrors,
  adminController.reactivateUser
);

router.delete(
  "/users/:userId",
  validationRules.mongoId,
  handleValidationErrors,
  adminController.deleteUser
);

// Application management
router.get(
  "/applications",
  validationRules.pagination,
  handleValidationErrors,
  adminController.getAllApplications
);

router.get(
  "/applications/:applicationId",
  validationRules.mongoId,
  handleValidationErrors,
  adminController.getApplication
);

router.patch(
  "/applications/:applicationId/status",
  validationRules.mongoId,
  validationRules.updateApplicationStatus,
  handleValidationErrors,
  adminController.updateApplicationStatus
);

router.post("/applications/apply", adminController.applyToJobOnBehalf);

// Job management
router.get(
  "/jobs",
  validationRules.pagination,
  handleValidationErrors,
  adminController.getAllJobs
);

router.patch(
  "/jobs/:jobId/approve",
  validationRules.mongoId,
  handleValidationErrors,
  adminController.approveJob
);

router.patch(
  "/jobs/:jobId/reject",
  validationRules.mongoId,
  handleValidationErrors,
  adminController.rejectJob
);

// Analytics
router.get("/analytics", adminController.getAnalytics);

// System settings
router.get("/settings", adminController.getSystemSettings);

router.put("/settings", adminController.updateSystemSettings);

module.exports = router;
