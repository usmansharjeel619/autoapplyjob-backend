const express = require("express");
const jobController = require("../controllers/job.controller");
const {
  authenticate,
  optionalAuth,
  requireAdmin,
} = require("../middleware/auth.middleware");
const {
  validationRules,
  handleValidationErrors,
} = require("../middleware/validation.middleware");

const router = express.Router();

// Public job search (with optional authentication for personalization)
router.get(
  "/search",
  optionalAuth,
  validationRules.jobSearch,
  validationRules.pagination,
  handleValidationErrors,
  jobController.searchJobs
);

// Job details (public with optional auth)
router.get(
  "/:id",
  optionalAuth,
  validationRules.mongoId,
  handleValidationErrors,
  jobController.getJobDetails
);

// Protected routes
router.use(authenticate);

// Apply to job
router.post(
  "/:id/apply",
  validationRules.mongoId,
  handleValidationErrors,
  jobController.applyToJob
);

// Get scraped jobs for user
router.get(
  "/scraped/:userId",
  validationRules.mongoId,
  validationRules.pagination,
  handleValidationErrors,
  jobController.getScrapedJobs
);

// Trigger job scraping (admin only)
router.post(
  "/scrape/:userId",
  requireAdmin,
  validationRules.mongoId,
  handleValidationErrors,
  jobController.triggerJobScraping
);

// Get scraping history
router.get(
  "/scraping-history/:userId",
  validationRules.mongoId,
  validationRules.pagination,
  handleValidationErrors,
  jobController.getScrapingHistory
);

// Get job statistics
router.get(
  "/statistics/:userId",
  validationRules.mongoId,
  handleValidationErrors,
  jobController.getJobStatistics
);

module.exports = router;
