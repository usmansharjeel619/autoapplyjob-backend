const Job = require("../models/Job.model");
const Application = require("../models/Application.model");
const User = require("../models/User.model");
const { ApiResponse } = require("../utils/apiResponse");
const { asyncHandler, AppError } = require("../middleware/error.middleware");
const scrapingService = require("../services/scraping.service");
const logger = require("../utils/logger");

// Search jobs with filters
const searchJobs = asyncHandler(async (req, res) => {
  const {
    q, // search query
    location,
    jobType,
    workType,
    industry,
    minSalary,
    maxSalary,
    minMatchScore = 0,
    datePosted, // days ago
    page = 1,
    pageSize = 20,
    sortBy = "matchScore",
    sortOrder = "desc",
    userId, // optional, for personalized results
  } = req.query;

  const skip = (page - 1) * pageSize;
  const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

  // Build search filter
  const filter = {
    status: "active",
    adminReviewStatus: "approved",
    isActive: true,
  };

  // If userId provided, filter for that user's jobs
  if (userId) {
    filter.targetUser = userId;
  }

  // Text search
  if (q) {
    filter.$or = [
      { title: { $regex: q, $options: "i" } },
      { company: { $regex: q, $options: "i" } },
      { description: { $regex: q, $options: "i" } },
      { skills: { $in: [new RegExp(q, "i")] } },
    ];
  }

  // Location filter
  if (location) {
    filter.location = { $regex: location, $options: "i" };
  }

  // Job type filter
  if (jobType) {
    filter.jobType = jobType;
  }

  // Work type filter
  if (workType) {
    filter.workType = workType;
  }

  // Industry filter
  if (industry) {
    filter.industry = industry;
  }

  // Salary range filter
  if (minSalary || maxSalary) {
    filter.$or = [];
    if (minSalary) {
      filter.$or.push({
        $or: [
          { "salary.min": { $gte: parseInt(minSalary) } },
          { "salary.max": { $gte: parseInt(minSalary) } },
        ],
      });
    }
    if (maxSalary) {
      filter.$or.push({
        $or: [
          { "salary.min": { $lte: parseInt(maxSalary) } },
          { "salary.max": { $lte: parseInt(maxSalary) } },
        ],
      });
    }
  }

  // Match score filter
  if (minMatchScore) {
    filter.matchScore = { $gte: parseInt(minMatchScore) };
  }

  // Date posted filter
  if (datePosted) {
    const daysAgo = parseInt(datePosted);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
    filter.postedDate = { $gte: cutoffDate };
  }

  try {
    // Execute search with pagination
    const [jobs, total] = await Promise.all([
      Job.find(filter).sort(sort).skip(skip).limit(parseInt(pageSize)).lean(),
      Job.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    ApiResponse.success(res, "Jobs retrieved successfully", {
      jobs,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      filters: {
        q,
        location,
        jobType,
        workType,
        industry,
        minSalary,
        maxSalary,
        minMatchScore,
        datePosted,
      },
    });
  } catch (error) {
    logger.error("Job search error:", error);
    throw new AppError("Failed to search jobs", 500);
  }
});

// Get job details by ID
const getJobDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user?._id;

  const job = await Job.findById(id).lean();
  if (!job) {
    throw new AppError("Job not found", 404);
  }

  // Check if user has access to this job (if user is authenticated)
  if (
    userId &&
    job.targetUser.toString() !== userId.toString() &&
    req.user.userType !== "admin"
  ) {
    throw new AppError("Job not found", 404);
  }

  // Get application status for this job and user
  let applicationStatus = null;
  if (userId) {
    const application = await Application.findOne({
      user: userId,
      job: id,
    })
      .select("status createdAt")
      .lean();

    if (application) {
      applicationStatus = {
        status: application.status,
        appliedAt: application.createdAt,
      };
    }
  }

  ApiResponse.success(res, "Job details retrieved successfully", {
    job: {
      ...job,
      applicationStatus,
    },
  });
});

// Apply to a job
const applyToJob = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user._id;
  const { coverLetter, userNotes } = req.body;

  // Check if job exists and belongs to user
  const job = await Job.findById(id);
  if (!job) {
    throw new AppError("Job not found", 404);
  }

  if (job.targetUser.toString() !== userId.toString()) {
    throw new AppError("Job not found", 404);
  }

  // Check if job is active and approved
  if (job.status !== "active" || job.adminReviewStatus !== "approved") {
    throw new AppError("Job is not available for application", 400);
  }

  // Check if already applied
  const existingApplication = await Application.findOne({
    user: userId,
    job: id,
  });

  if (existingApplication) {
    throw new AppError("You have already applied to this job", 400);
  }

  // Create application
  const application = new Application({
    user: userId,
    job: id,
    matchScore: job.matchScore,
    status: "pending_review",
    coverLetter,
    userNotes,
    applicationMethod: "manual",
  });

  await application.save();

  // Update job application status
  job.applicationStatus = "not_applied"; // Will be updated when admin applies
  await job.save();

  ApiResponse.success(res, "Application submitted successfully", {
    application: {
      id: application._id,
      status: application.status,
      submittedAt: application.createdAt,
    },
  });
});

// Get scraped jobs for a specific user (admin or user themselves)
const getScrapedJobs = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const requestingUser = req.user;
  const {
    page = 1,
    pageSize = 20,
    status = "active",
    adminReviewStatus,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  // Check permissions
  if (
    requestingUser.userType !== "admin" &&
    requestingUser._id.toString() !== userId
  ) {
    throw new AppError("Access denied", 403);
  }

  const skip = (page - 1) * pageSize;
  const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

  // Build filter
  const filter = {
    targetUser: userId,
    isActive: true,
  };

  if (status) {
    filter.status = status;
  }

  if (adminReviewStatus) {
    filter.adminReviewStatus = adminReviewStatus;
  }

  try {
    const [jobs, total] = await Promise.all([
      Job.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(pageSize))
        .populate("reviewedBy", "name")
        .lean(),
      Job.countDocuments(filter),
    ]);

    ApiResponse.success(res, "Scraped jobs retrieved successfully", {
      jobs,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    logger.error("Error retrieving scraped jobs:", error);
    throw new AppError("Failed to retrieve scraped jobs", 500);
  }
});

// Trigger job scraping for a user (admin only)
const triggerJobScraping = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const adminId = req.user._id;

  // Verify user exists
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (!user.onboardingCompleted) {
    throw new AppError("User has not completed onboarding", 400);
  }

  try {
    const sessionId = await scrapingService.triggerManualScraping(
      userId,
      adminId
    );

    ApiResponse.success(res, "Job scraping initiated successfully", {
      sessionId,
      message: "Scraping process started. Results will be available shortly.",
    });
  } catch (error) {
    logger.error("Error triggering job scraping:", error);
    throw new AppError("Failed to initiate job scraping", 500);
  }
});

// Get scraping history for a user
const getScrapingHistory = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const requestingUser = req.user;
  const { page = 1, pageSize = 10 } = req.query;

  // Check permissions
  if (
    requestingUser.userType !== "admin" &&
    requestingUser._id.toString() !== userId
  ) {
    throw new AppError("Access denied", 403);
  }

  try {
    const history = await scrapingService.getScrapingHistory(
      userId,
      parseInt(page),
      parseInt(pageSize)
    );

    ApiResponse.success(
      res,
      "Scraping history retrieved successfully",
      history
    );
  } catch (error) {
    logger.error("Error retrieving scraping history:", error);
    throw new AppError("Failed to retrieve scraping history", 500);
  }
});

// Get job statistics for a user
const getJobStatistics = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const requestingUser = req.user;

  // Check permissions
  if (
    requestingUser.userType !== "admin" &&
    requestingUser._id.toString() !== userId
  ) {
    throw new AppError("Access denied", 403);
  }

  try {
    // Get job counts by status
    const jobStats = await Job.aggregate([
      { $match: { targetUser: mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    // Get jobs by admin review status
    const reviewStats = await Job.aggregate([
      { $match: { targetUser: mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: "$adminReviewStatus",
          count: { $sum: 1 },
        },
      },
    ]);

    // Get average match score
    const matchScoreStats = await Job.aggregate([
      { $match: { targetUser: mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          averageMatchScore: { $avg: "$matchScore" },
          maxMatchScore: { $max: "$matchScore" },
          minMatchScore: { $min: "$matchScore" },
        },
      },
    ]);

    // Get application statistics
    const applicationStats = await Application.getStatistics(userId);

    // Get scraping statistics
    const scrapingStats = await scrapingService.getScrapingStatistics(userId);

    const statistics = {
      jobs: {
        total: jobStats.reduce((sum, stat) => sum + stat.count, 0),
        byStatus: jobStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
        byReviewStatus: reviewStats.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {}),
      },
      matchScores: matchScoreStats[0] || {
        averageMatchScore: 0,
        maxMatchScore: 0,
        minMatchScore: 0,
      },
      applications: applicationStats,
      scraping: scrapingStats,
    };

    ApiResponse.success(
      res,
      "Job statistics retrieved successfully",
      statistics
    );
  } catch (error) {
    logger.error("Error retrieving job statistics:", error);
    throw new AppError("Failed to retrieve job statistics", 500);
  }
});

module.exports = {
  searchJobs,
  getJobDetails,
  applyToJob,
  getScrapedJobs,
  triggerJobScraping,
  getScrapingHistory,
  getJobStatistics,
};
