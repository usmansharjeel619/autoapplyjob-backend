const { body, param, query, validationResult } = require("express-validator");
const { ApiResponse } = require("../utils/apiResponse");

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map((error) => ({
      field: error.path,
      message: error.msg,
      value: error.value,
    }));

    return ApiResponse.validationError(res, "Validation failed", errorMessages);
  }
  next();
};

// Common validation rules
const validationRules = {
  // User validation
  registerUser: [
    body("name")
      .trim()
      .notEmpty()
      .withMessage("Name is required")
      .isLength({ min: 2, max: 100 })
      .withMessage("Name must be between 2 and 100 characters"),

    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Please provide a valid email address"),

    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters long")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage(
        "Password must contain at least one lowercase letter, one uppercase letter, and one number"
      ),

    body("userType")
      .optional()
      .isIn(["user", "admin"])
      .withMessage("User type must be either user or admin"),
  ],

  loginUser: [
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Please provide a valid email address"),

    body("password").notEmpty().withMessage("Password is required"),
  ],

  updateProfile: [
    body("name")
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Name must be between 2 and 100 characters"),

    body("phone")
      .optional()
      .isMobilePhone()
      .withMessage("Please provide a valid phone number"),

    body("experienceLevel")
      .optional()
      .isIn(["0-1", "1-3", "3-5", "5-10", "10+"])
      .withMessage("Invalid experience level"),

    body("educationLevel")
      .optional()
      .isIn(["high_school", "associate", "bachelor", "master", "phd", "other"])
      .withMessage("Invalid education level"),

    body("skills").optional().isArray().withMessage("Skills must be an array"),

    body("skills.*")
      .optional()
      .trim()
      .isLength({ min: 1, max: 50 })
      .withMessage("Each skill must be between 1 and 50 characters"),

    body("bio")
      .optional()
      .isLength({ max: 1000 })
      .withMessage("Bio cannot exceed 1000 characters"),

    body("linkedinUrl")
      .optional()
      .isURL()
      .withMessage("Please provide a valid LinkedIn URL"),

    body("githubUrl")
      .optional()
      .isURL()
      .withMessage("Please provide a valid GitHub URL"),

    body("portfolioUrl")
      .optional()
      .isURL()
      .withMessage("Please provide a valid portfolio URL"),
  ],

  // Job validation
  createJob: [
    body("title")
      .trim()
      .notEmpty()
      .withMessage("Job title is required")
      .isLength({ max: 200 })
      .withMessage("Job title cannot exceed 200 characters"),

    body("company").trim().notEmpty().withMessage("Company name is required"),

    body("location").trim().notEmpty().withMessage("Location is required"),

    body("workType")
      .isIn(["remote", "hybrid", "onsite"])
      .withMessage("Work type must be remote, hybrid, or onsite"),

    body("jobType")
      .isIn(["full_time", "part_time", "contract", "freelance", "internship"])
      .withMessage("Invalid job type"),

    body("description")
      .trim()
      .notEmpty()
      .withMessage("Job description is required"),

    body("applyUrl")
      .isURL()
      .withMessage("Please provide a valid application URL"),

    body("skills").optional().isArray().withMessage("Skills must be an array"),

    body("salary.min")
      .optional()
      .isNumeric()
      .isFloat({ min: 0 })
      .withMessage("Minimum salary must be a positive number"),

    body("salary.max")
      .optional()
      .isNumeric()
      .isFloat({ min: 0 })
      .withMessage("Maximum salary must be a positive number"),
  ],

  // Application validation
  updateApplicationStatus: [
    body("status")
      .isIn([
        "pending_review",
        "approved",
        "rejected",
        "applied",
        "application_sent",
        "viewed",
        "interview_requested",
        "interview_scheduled",
        "interview_completed",
        "offer_received",
        "offer_accepted",
        "offer_rejected",
        "rejected_by_employer",
        "withdrawn",
      ])
      .withMessage("Invalid application status"),
  ],

  // Common parameter validation
  mongoId: [param("id").isMongoId().withMessage("Invalid ID format")],

  // Pagination validation
  pagination: [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),

    query("pageSize")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Page size must be between 1 and 100"),

    query("sortBy")
      .optional()
      .isIn([
        "createdAt",
        "updatedAt",
        "name",
        "title",
        "matchScore",
        "postedDate",
      ])
      .withMessage("Invalid sort field"),

    query("sortOrder")
      .optional()
      .isIn(["asc", "desc"])
      .withMessage("Sort order must be asc or desc"),
  ],

  // Job search validation
  jobSearch: [
    query("q")
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage("Search query cannot exceed 200 characters"),

    query("location")
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage("Location cannot exceed 100 characters"),

    query("jobType")
      .optional()
      .isIn(["full_time", "part_time", "contract", "freelance", "internship"])
      .withMessage("Invalid job type"),

    query("workType")
      .optional()
      .isIn(["remote", "hybrid", "onsite"])
      .withMessage("Invalid work type"),

    query("minSalary")
      .optional()
      .isNumeric()
      .isFloat({ min: 0 })
      .withMessage("Minimum salary must be a positive number"),

    query("maxSalary")
      .optional()
      .isNumeric()
      .isFloat({ min: 0 })
      .withMessage("Maximum salary must be a positive number"),

    query("minMatchScore")
      .optional()
      .isInt({ min: 0, max: 100 })
      .withMessage("Match score must be between 0 and 100"),
  ],

  // Password reset validation
  forgotPassword: [
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Please provide a valid email address"),
  ],

  resetPassword: [
    body("token").notEmpty().withMessage("Reset token is required"),

    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters long")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage(
        "Password must contain at least one lowercase letter, one uppercase letter, and one number"
      ),
  ],

  changePassword: [
    body("currentPassword")
      .notEmpty()
      .withMessage("Current password is required"),

    body("newPassword")
      .isLength({ min: 6 })
      .withMessage("New password must be at least 6 characters long")
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage(
        "New password must contain at least one lowercase letter, one uppercase letter, and one number"
      ),
  ],
};

module.exports = {
  validationRules,
  handleValidationErrors,
};
