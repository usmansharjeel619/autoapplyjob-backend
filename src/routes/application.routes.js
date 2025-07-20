const express = require("express");
const applicationController = require("../controllers/application.controller");
const { authenticate, requireAdmin } = require("../middleware/auth.middleware");
const {
  validationRules,
  handleValidationErrors,
} = require("../middleware/validation.middleware");

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Get user's applications
router.get(
  "/",
  validationRules.pagination,
  handleValidationErrors,
  applicationController.getUserApplications
);

// Get application details
router.get(
  "/:applicationId",
  validationRules.mongoId,
  handleValidationErrors,
  applicationController.getApplicationDetails
);

// Update application status (user can withdraw)
router.patch(
  "/:applicationId/status",
  validationRules.mongoId,
  validationRules.updateApplicationStatus,
  handleValidationErrors,
  applicationController.updateApplicationStatus
);

// Withdraw application
router.patch(
  "/:applicationId/withdraw",
  validationRules.mongoId,
  handleValidationErrors,
  applicationController.withdrawApplication
);

// Add notes to application
router.patch(
  "/:applicationId/notes",
  validationRules.mongoId,
  handleValidationErrors,
  applicationController.addApplicationNotes
);

// Get application statistics
router.get(
  "/statistics/overview",
  applicationController.getApplicationStatistics
);

module.exports = router;
