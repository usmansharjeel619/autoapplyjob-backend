// Application status constants
const APPLICATION_STATUS = {
  PENDING_REVIEW: "pending_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  APPLIED: "applied",
  APPLICATION_SENT: "application_sent",
  VIEWED: "viewed",
  INTERVIEW_REQUESTED: "interview_requested",
  INTERVIEW_SCHEDULED: "interview_scheduled",
  INTERVIEW_COMPLETED: "interview_completed",
  OFFER_RECEIVED: "offer_received",
  OFFER_ACCEPTED: "offer_accepted",
  OFFER_REJECTED: "offer_rejected",
  REJECTED_BY_EMPLOYER: "rejected_by_employer",
  WITHDRAWN: "withdrawn",
};

// Job status constants
const JOB_STATUS = {
  ACTIVE: "active",
  EXPIRED: "expired",
  FILLED: "filled",
  REMOVED: "removed",
};

// Admin review status
const ADMIN_REVIEW_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
};

// User types
const USER_TYPES = {
  USER: "user",
  ADMIN: "admin",
};

// Package types
const PACKAGE_TYPES = {
  BASIC: "basic",
  PREMIUM: "premium",
  ENTERPRISE: "enterprise",
};

// Scraping platforms
const SCRAPING_PLATFORMS = {
  LINKEDIN: "linkedin",
  INDEED: "indeed",
  GLASSDOOR: "glassdoor",
  MONSTER: "monster",
  ZIPRECRUITER: "ziprecruiter",
  CAREERBUILDER: "careerbuilder",
};

// File upload constants
const UPLOAD_LIMITS = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_RESUME_TYPES: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  ALLOWED_IMAGE_TYPES: ["image/jpeg", "image/png", "image/webp"],
};

// Pagination defaults
const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
};

// Rate limiting
const RATE_LIMITS = {
  GENERAL: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 100,
  },
  AUTH: {
    WINDOW_MS: 15 * 60 * 1000, // 15 minutes
    MAX_REQUESTS: 5,
  },
  SENSITIVE: {
    WINDOW_MS: 60 * 60 * 1000, // 1 hour
    MAX_REQUESTS: 3,
  },
};

// Email templates
const EMAIL_TEMPLATES = {
  VERIFICATION: "verification",
  PASSWORD_RESET: "password_reset",
  WELCOME: "welcome",
  APPLICATION_UPDATE: "application_update",
  DAILY_DIGEST: "daily_digest",
};

module.exports = {
  APPLICATION_STATUS,
  JOB_STATUS,
  ADMIN_REVIEW_STATUS,
  USER_TYPES,
  PACKAGE_TYPES,
  SCRAPING_PLATFORMS,
  UPLOAD_LIMITS,
  PAGINATION,
  RATE_LIMITS,
  EMAIL_TEMPLATES,
};
