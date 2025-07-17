const User = require("../models/User.model");
const Job = require("../models/Job.model");
const Application = require("../models/Application.model");
const ScrapingLog = require("../models/ScrapingLog.model");
const { ApiResponse } = require("../utils/apiResponse");
const { asyncHandler, AppError } = require("../middleware/error.middleware");
const scrapingService = require("../services/scraping.service");
const analyticsService = require("../services/analytics.service");
const logger = require("../utils/logger");
const mongoose = require("mongoose");

// Get admin dashboard statistics
const getDashboardStats = asyncHandler(async (req, res) => {
  try {
    // Get basic counts
    const [
      totalUsers,
      activeUsers,
      totalApplications,
      pendingApplications,
      totalJobs,
      pendingJobs,
    ] = await Promise.all([
      User.countDocuments({ userType: "user" }),
      User.countDocuments({ userType: "user", isActive: true }),
      Application.countDocuments(),
      Application.countDocuments({ status: "pending_review" }),
      Job.countDocuments(),
      Job.countDocuments({ adminReviewStatus: "pending" }),
    ]);

    // Get application statistics
    const applicationStats = await Application.getStatistics();

    // Get recent applications
    const recentApplications = await Application.find()
      .populate("user", "name email")
      .populate("job", "title company location")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    // Get top performing jobs (by application count)
    const topPerformingJobs = await Application.aggregate([
      {
        $lookup: {
          from: "jobs",
          localField: "job",
          foreignField: "_id",
          as: "jobDetails",
        },
      },
      { $unwind: "$jobDetails" },
      {
        $group: {
          _id: "$job",
          jobTitle: { $first: "$jobDetails.title" },
          company: { $first: "$jobDetails.company" },
          applications: { $sum: 1 },
          interviews: {
            $sum: {
              $cond: [
                {
                  $in: [
                    "$status",
                    ["interview_scheduled", "interview_completed"],
                  ],
                },
                1,
                0,
              ],
            },
          },
          offers: {
            $sum: {
              $cond: [{ $eq: ["$status", "offer_received"] }, 1, 0],
            },
          },
          averageMatchScore: { $avg: "$matchScore" },
        },
      },
      {
        $addFields: {
          successRate: {
            $cond: [
              { $gt: ["$applications", 0] },
              { $multiply: [{ $divide: ["$offers", "$applications"] }, 100] },
              0,
            ],
          },
        },
      },
      { $sort: { applications: -1 } },
      { $limit: 5 },
    ]);

    // Get scraping system health
    const scrapingHealth = await scrapingService.checkScrapingServiceHealth();

    // Get latest scraping statistics
    const scrapingStats = await scrapingService.getScrapingStatistics(null, 7); // Last 7 days

    // Calculate success rate
    const successRate =
      totalApplications > 0
        ? Math.round(
            (applicationStats.offer_received / totalApplications) * 100
          )
        : 0;

    const dashboardData = {
      stats: {
        totalUsers,
        activeApplications:
          applicationStats.applied + applicationStats.interview_scheduled,
        pendingReviews: pendingApplications,
        successRate,
        jobsScraped: scrapingStats.totalJobsSaved || 0,
        averageMatchScore: 0, // Calculate if needed
        usersTrend: 0, // Calculate based on previous period
        applicationsTrend: 0, // Calculate based on previous period
        successRateTrend: 0, // Calculate based on previous period
      },
      recentApplications: recentApplications.map((app) => ({
        id: app._id,
        applicantName: app.user?.name || "Unknown",
        applicantEmail: app.user?.email || "",
        jobTitle: app.job?.title || "Unknown",
        company: app.job?.company || "Unknown",
        status: app.status,
        submittedAt: app.createdAt,
        matchScore: app.matchScore,
      })),
      topPerformingJobs: topPerformingJobs.map((job) => ({
        jobTitle: job.jobTitle,
        company: job.company,
        applications: job.applications,
        interviews: job.interviews,
        successRate: Math.round(job.successRate),
        averageMatchScore: Math.round(job.averageMatchScore),
      })),
      systemHealth: {
        scrapingStatus:
          scrapingHealth.status === "healthy" ? "active" : "inactive",
        lastScrapingRun: null, // Get from latest scraping log
        totalJobsScraped: scrapingStats.totalJobsSaved || 0,
      },
    };

    ApiResponse.success(
      res,
      "Dashboard statistics retrieved successfully",
      dashboardData
    );
  } catch (error) {
    logger.error("Error retrieving dashboard stats:", error);
    throw new AppError("Failed to retrieve dashboard statistics", 500);
  }
});

// Get all users with filtering and pagination
const getAllUsers = asyncHandler(async (req, res) => {
  const {
    page = 1,
    pageSize = 20,
    search,
    userType,
    isActive,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  const skip = (page - 1) * pageSize;
  const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

  // Build filter
  const filter = { userType: { $ne: "admin" } }; // Exclude admin users

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  if (userType) {
    filter.userType = userType;
  }

  if (isActive !== undefined) {
    filter.isActive = isActive === "true";
  }

  try {
    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-password -emailVerificationToken -passwordResetToken")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(pageSize))
        .lean(),
      User.countDocuments(filter),
    ]);

    // Get application counts for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const applicationCount = await Application.countDocuments({
          user: user._id,
        });
        const jobCount = await Job.countDocuments({ targetUser: user._id });

        return {
          ...user,
          applicationCount,
          jobCount,
        };
      })
    );

    ApiResponse.success(res, "Users retrieved successfully", {
      users: usersWithStats,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    logger.error("Error retrieving users:", error);
    throw new AppError("Failed to retrieve users", 500);
  }
});

// Get user details by ID
const getUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const user = await User.findById(userId)
    .select("-password -emailVerificationToken -passwordResetToken")
    .lean();

  if (!user) {
    throw new AppError("User not found", 404);
  }

  // Get additional user statistics
  const [applicationStats, jobStats, scrapingStats] = await Promise.all([
    Application.getStatistics(userId),
    Job.aggregate([
      { $match: { targetUser: mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: "$adminReviewStatus",
          count: { $sum: 1 },
        },
      },
    ]),
    scrapingService.getScrapingStatistics(userId),
  ]);

  const userDetails = {
    ...user,
    statistics: {
      applications: applicationStats,
      jobs: jobStats.reduce(
        (acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        },
        { total: jobStats.reduce((sum, stat) => sum + stat.count, 0) }
      ),
      scraping: scrapingStats,
    },
  };

  ApiResponse.success(res, "User details retrieved successfully", {
    user: userDetails,
  });
});

// Update user details (admin only)
const updateUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const updateData = req.body;

  // Remove sensitive fields that shouldn't be updated via this endpoint
  delete updateData.password;
  delete updateData.userType;
  delete updateData.emailVerificationToken;
  delete updateData.passwordResetToken;

  const user = await User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
  }).select("-password -emailVerificationToken -passwordResetToken");

  if (!user) {
    throw new AppError("User not found", 404);
  }

  logger.info(`User ${userId} updated by admin ${req.user._id}`);

  ApiResponse.success(res, "User updated successfully", { user });
});

// Deactivate user account
const deactivateUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const user = await User.findByIdAndUpdate(
    userId,
    { isActive: false },
    { new: true }
  ).select("-password");

  if (!user) {
    throw new AppError("User not found", 404);
  }

  logger.info(`User ${userId} deactivated by admin ${req.user._id}`);

  ApiResponse.success(res, "User deactivated successfully", { user });
});

// Reactivate user account
const reactivateUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const user = await User.findByIdAndUpdate(
    userId,
    { isActive: true },
    { new: true }
  ).select("-password");

  if (!user) {
    throw new AppError("User not found", 404);
  }

  logger.info(`User ${userId} reactivated by admin ${req.user._id}`);

  ApiResponse.success(res, "User reactivated successfully", { user });
});

// Delete user account (soft delete)
const deleteUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  // Instead of hard delete, we'll deactivate and mark for deletion
  const user = await User.findByIdAndUpdate(
    userId,
    {
      isActive: false,
      deletedAt: new Date(),
      deletedBy: req.user._id,
    },
    { new: true }
  ).select("-password");

  if (!user) {
    throw new AppError("User not found", 404);
  }

  logger.info(`User ${userId} marked for deletion by admin ${req.user._id}`);

  ApiResponse.success(res, "User deleted successfully");
});

// Get all applications with filtering
const getAllApplications = asyncHandler(async (req, res) => {
  const {
    page = 1,
    pageSize = 20,
    status,
    userId,
    jobId,
    sortBy = "createdAt",
    sortOrder = "desc",
    search,
  } = req.query;

  const skip = (page - 1) * pageSize;
  const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

  // Build filter
  const filter = {};

  if (status) {
    filter.status = status;
  }

  if (userId) {
    filter.user = userId;
  }

  if (jobId) {
    filter.job = jobId;
  }

  try {
    // Build aggregation pipeline for search
    const pipeline = [];

    if (search) {
      pipeline.push({
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "userDetails",
        },
      });
      pipeline.push({
        $lookup: {
          from: "jobs",
          localField: "job",
          foreignField: "_id",
          as: "jobDetails",
        },
      });
      pipeline.push({
        $match: {
          $or: [
            { "userDetails.name": { $regex: search, $options: "i" } },
            { "userDetails.email": { $regex: search, $options: "i" } },
            { "jobDetails.title": { $regex: search, $options: "i" } },
            { "jobDetails.company": { $regex: search, $options: "i" } },
          ],
        },
      });
    }

    // Add other filters
    if (Object.keys(filter).length > 0) {
      pipeline.push({ $match: filter });
    }

    // Add pagination and sorting
    pipeline.push({ $sort: sort });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: parseInt(pageSize) });

    // Populate user and job details
    pipeline.push({
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user",
      },
    });
    pipeline.push({
      $lookup: {
        from: "jobs",
        localField: "job",
        foreignField: "_id",
        as: "job",
      },
    });
    pipeline.push({
      $lookup: {
        from: "users",
        localField: "reviewedBy",
        foreignField: "_id",
        as: "reviewedBy",
      },
    });
    pipeline.push({
      $lookup: {
        from: "users",
        localField: "appliedBy",
        foreignField: "_id",
        as: "appliedBy",
      },
    });

    // Execute aggregation
    const [applications, totalCount] = await Promise.all([
      Application.aggregate(pipeline),
      search || Object.keys(filter).length > 0
        ? Application.countDocuments(filter)
        : Application.countDocuments(),
    ]);

    // Format response
    const formattedApplications = applications.map((app) => ({
      id: app._id,
      applicantName: app.user[0]?.name || "Unknown",
      applicantEmail: app.user[0]?.email || "",
      jobTitle: app.job[0]?.title || "Unknown",
      company: app.job[0]?.company || "Unknown",
      location: app.job[0]?.location || "",
      status: app.status,
      matchScore: app.matchScore,
      submittedAt: app.createdAt,
      reviewedBy: app.reviewedBy[0]?.name || null,
      reviewedAt: app.reviewedAt,
      appliedBy: app.appliedBy[0]?.name || null,
      appliedAt: app.appliedAt,
    }));

    ApiResponse.success(res, "Applications retrieved successfully", {
      applications: formattedApplications,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total: totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    });
  } catch (error) {
    logger.error("Error retrieving applications:", error);
    throw new AppError("Failed to retrieve applications", 500);
  }
});

// Get application details by ID
const getApplication = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;

  const application = await Application.findById(applicationId)
    .populate("user", "name email phone currentJobTitle")
    .populate("job")
    .populate("reviewedBy", "name")
    .populate("appliedBy", "name")
    .lean();

  if (!application) {
    throw new AppError("Application not found", 404);
  }

  ApiResponse.success(res, "Application details retrieved successfully", {
    application,
  });
});

// Update application status
const updateApplicationStatus = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const { status, adminNotes } = req.body;
  const adminId = req.user._id;

  const application = await Application.findById(applicationId);
  if (!application) {
    throw new AppError("Application not found", 404);
  }

  // Update application
  application.status = status;
  application.reviewedBy = adminId;
  application.reviewedAt = new Date();

  if (adminNotes) {
    application.adminNotes = adminNotes;
  }

  await application.save();

  logger.info(
    `Application ${applicationId} status updated to ${status} by admin ${adminId}`
  );

  ApiResponse.success(res, "Application status updated successfully", {
    application: {
      id: application._id,
      status: application.status,
      reviewedAt: application.reviewedAt,
    },
  });
});

// Apply to job on behalf of user
const applyToJobOnBehalf = asyncHandler(async (req, res) => {
  const { userId, jobId } = req.body;
  const adminId = req.user._id;

  // Verify user and job exist
  const [user, job] = await Promise.all([
    User.findById(userId),
    Job.findById(jobId),
  ]);

  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (!job) {
    throw new AppError("Job not found", 404);
  }

  // Check if job belongs to the user
  if (job.targetUser.toString() !== userId.toString()) {
    throw new AppError("Job does not belong to this user", 400);
  }

  // Check if application already exists
  const existingApplication = await Application.findOne({
    user: userId,
    job: jobId,
  });

  if (!existingApplication) {
    throw new AppError("No application found for this job", 404);
  }

  if (existingApplication.status !== "approved") {
    throw new AppError("Application must be approved before applying", 400);
  }

  // Update application status to applied
  existingApplication.status = "applied";
  existingApplication.appliedBy = adminId;
  existingApplication.appliedAt = new Date();
  await existingApplication.save();

  // Update job application status
  job.applicationStatus = "applied";
  await job.save();

  // Update user statistics
  await User.findByIdAndUpdate(userId, {
    $inc: { "stats.totalApplications": 1 },
  });

  logger.info(
    `Admin ${adminId} applied to job ${jobId} on behalf of user ${userId}`
  );

  ApiResponse.success(res, "Application submitted successfully", {
    application: {
      id: existingApplication._id,
      status: existingApplication.status,
      appliedAt: existingApplication.appliedAt,
    },
  });
});

// Get all jobs (for admin review)
const getAllJobs = asyncHandler(async (req, res) => {
  const {
    page = 1,
    pageSize = 20,
    adminReviewStatus,
    status,
    userId,
    sortBy = "createdAt",
    sortOrder = "desc",
    search,
  } = req.query;

  const skip = (page - 1) * pageSize;
  const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

  // Build filter
  const filter = {};

  if (adminReviewStatus) {
    filter.adminReviewStatus = adminReviewStatus;
  }

  if (status) {
    filter.status = status;
  }

  if (userId) {
    filter.targetUser = userId;
  }

  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: "i" } },
      { company: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
    ];
  }

  try {
    const [jobs, total] = await Promise.all([
      Job.find(filter)
        .populate("targetUser", "name email")
        .populate("reviewedBy", "name")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(pageSize))
        .lean(),
      Job.countDocuments(filter),
    ]);

    ApiResponse.success(res, "Jobs retrieved successfully", {
      jobs,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    logger.error("Error retrieving jobs:", error);
    throw new AppError("Failed to retrieve jobs", 500);
  }
});

// Approve job for application
const approveJob = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const { reviewNotes } = req.body;
  const adminId = req.user._id;

  const job = await Job.findById(jobId);
  if (!job) {
    throw new AppError("Job not found", 404);
  }

  job.adminReviewStatus = "approved";
  job.reviewedBy = adminId;
  job.reviewedAt = new Date();

  if (reviewNotes) {
    job.reviewNotes = reviewNotes;
  }

  await job.save();

  logger.info(`Job ${jobId} approved by admin ${adminId}`);

  ApiResponse.success(res, "Job approved successfully");
});

// Reject job
const rejectJob = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const { reviewNotes } = req.body;
  const adminId = req.user._id;

  const job = await Job.findById(jobId);
  if (!job) {
    throw new AppError("Job not found", 404);
  }

  job.adminReviewStatus = "rejected";
  job.reviewedBy = adminId;
  job.reviewedAt = new Date();

  if (reviewNotes) {
    job.reviewNotes = reviewNotes;
  }

  await job.save();

  logger.info(`Job ${jobId} rejected by admin ${adminId}`);

  ApiResponse.success(res, "Job rejected successfully");
});

// Get analytics data
const getAnalytics = asyncHandler(async (req, res) => {
  const { period = "30d" } = req.query;

  try {
    const analytics = await analyticsService.getAnalytics(period);
    ApiResponse.success(
      res,
      "Analytics data retrieved successfully",
      analytics
    );
  } catch (error) {
    logger.error("Error retrieving analytics:", error);
    throw new AppError("Failed to retrieve analytics data", 500);
  }
});

// Get system settings
const getSystemSettings = asyncHandler(async (req, res) => {
  // For now, return default settings
  // In a full implementation, these would be stored in database
  const settings = {
    scraping: {
      maxJobsPerUser: 100,
      scrapingInterval: 24, // hours
      enabledPlatforms: ["linkedin", "indeed", "glassdoor"],
      autoApproveJobs: false,
    },
    applications: {
      maxApplicationsPerDay: 10,
      autoApplyEnabled: false,
      requireAdminReview: true,
    },
    email: {
      notifications: true,
      dailyDigest: true,
      applicationUpdates: true,
    },
    system: {
      maintenanceMode: false,
      registrationEnabled: true,
      debugMode: process.env.NODE_ENV === "development",
    },
  };

  ApiResponse.success(res, "System settings retrieved successfully", {
    settings,
  });
});

// Update system settings
const updateSystemSettings = asyncHandler(async (req, res) => {
  const { settings } = req.body;
  const adminId = req.user._id;

  // In a full implementation, save settings to database
  // For now, just log the update
  logger.info(`System settings updated by admin ${adminId}:`, settings);

  ApiResponse.success(res, "System settings updated successfully", {
    settings,
  });
});

module.exports = {
  getDashboardStats,
  getAllUsers,
  getUser,
  updateUser,
  deactivateUser,
  reactivateUser,
  deleteUser,
  getAllApplications,
  getApplication,
  updateApplicationStatus,
  applyToJobOnBehalf,
  getAllJobs,
  approveJob,
  rejectJob,
  getAnalytics,
  getSystemSettings,
  updateSystemSettings,
};
