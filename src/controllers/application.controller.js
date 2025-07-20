const Application = require("../models/Application.model");
const Job = require("../models/Job.model");
const { ApiResponse } = require("../utils/apiResponse");
const { asyncHandler, AppError } = require("../middleware/error.middleware");
const logger = require("../utils/logger");

// Get user's applications with filtering and pagination
const getUserApplications = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const {
    page = 1,
    pageSize = 20,
    status,
    sortBy = "createdAt",
    sortOrder = "desc",
    search,
  } = req.query;

  const skip = (page - 1) * pageSize;
  const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

  // Build filter
  const filter = { user: userId };

  if (status) {
    filter.status = status;
  }

  if (search) {
    // Search in job title or company
    const jobFilter = {
      $or: [
        { title: { $regex: search, $options: "i" } },
        { company: { $regex: search, $options: "i" } },
      ],
    };
    const matchingJobs = await Job.find(jobFilter).select("_id");
    const jobIds = matchingJobs.map((job) => job._id);
    filter.job = { $in: jobIds };
  }

  try {
    const [applications, total] = await Promise.all([
      Application.find(filter)
        .populate("job", "title company location salary requirements")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(pageSize))
        .lean(),
      Application.countDocuments(filter),
    ]);

    ApiResponse.success(res, "Applications retrieved successfully", {
      applications,
      pagination: {
        page: parseInt(page),
        pageSize: parseInt(pageSize),
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    logger.error("Error retrieving applications:", error);
    throw new AppError("Failed to retrieve applications", 500);
  }
});

// Get application details
const getApplicationDetails = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const userId = req.user._id;

  const application = await Application.findOne({
    _id: applicationId,
    user: userId,
  })
    .populate("job", "title company location salary requirements description")
    .populate("user", "name email")
    .lean();

  if (!application) {
    throw new AppError("Application not found", 404);
  }

  ApiResponse.success(res, "Application details retrieved successfully", {
    application,
  });
});

// Update application status (mainly for withdrawal)
const updateApplicationStatus = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const { status } = req.body;
  const userId = req.user._id;

  // Users can only withdraw their own applications
  if (status !== "withdrawn") {
    throw new AppError("You can only withdraw your applications", 400);
  }

  const application = await Application.findOne({
    _id: applicationId,
    user: userId,
  });

  if (!application) {
    throw new AppError("Application not found", 404);
  }

  if (application.status === "withdrawn") {
    throw new AppError("Application is already withdrawn", 400);
  }

  application.status = status;
  application.statusUpdatedAt = new Date();
  await application.save();

  logger.info(`Application ${applicationId} ${status} by user ${userId}`);

  ApiResponse.success(res, "Application status updated successfully", {
    application,
  });
});

// Withdraw application (dedicated endpoint)
const withdrawApplication = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const { reason } = req.body;
  const userId = req.user._id;

  const application = await Application.findOne({
    _id: applicationId,
    user: userId,
  });

  if (!application) {
    throw new AppError("Application not found", 404);
  }

  if (application.status === "withdrawn") {
    throw new AppError("Application is already withdrawn", 400);
  }

  application.status = "withdrawn";
  application.statusUpdatedAt = new Date();

  if (reason) {
    application.withdrawalReason = reason;
  }

  await application.save();

  logger.info(`Application ${applicationId} withdrawn by user ${userId}`);

  ApiResponse.success(res, "Application withdrawn successfully", {
    application,
  });
});

// Add notes to application
const addApplicationNotes = asyncHandler(async (req, res) => {
  const { applicationId } = req.params;
  const { notes } = req.body;
  const userId = req.user._id;

  const application = await Application.findOne({
    _id: applicationId,
    user: userId,
  });

  if (!application) {
    throw new AppError("Application not found", 404);
  }

  application.userNotes = notes;
  await application.save();

  ApiResponse.success(res, "Application notes updated successfully", {
    application,
  });
});

// Get application statistics for user
const getApplicationStatistics = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  try {
    const stats = await Application.aggregate([
      { $match: { user: userId } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    // Get total applications
    const totalApplications = await Application.countDocuments({
      user: userId,
    });

    // Get applications this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const applicationsThisMonth = await Application.countDocuments({
      user: userId,
      createdAt: { $gte: startOfMonth },
    });

    // Get success rate (interviews + offers)
    const successfulApplications = await Application.countDocuments({
      user: userId,
      status: {
        $in: [
          "interview_scheduled",
          "interview_completed",
          "offer_received",
          "offer_accepted",
          "hired",
        ],
      },
    });

    const successRate =
      totalApplications > 0
        ? (successfulApplications / totalApplications) * 100
        : 0;

    // Get recent activity (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentActivity = await Application.find({
      user: userId,
      statusUpdatedAt: { $gte: thirtyDaysAgo },
    })
      .populate("job", "title company")
      .sort({ statusUpdatedAt: -1 })
      .limit(10)
      .lean();

    const statistics = {
      total: totalApplications,
      thisMonth: applicationsThisMonth,
      successRate: Math.round(successRate * 100) / 100,
      byStatus: stats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {}),
      recentActivity,
    };

    ApiResponse.success(res, "Application statistics retrieved successfully", {
      statistics,
    });
  } catch (error) {
    logger.error("Error retrieving application statistics:", error);
    throw new AppError("Failed to retrieve application statistics", 500);
  }
});

module.exports = {
  getUserApplications,
  getApplicationDetails,
  updateApplicationStatus,
  withdrawApplication,
  addApplicationNotes,
  getApplicationStatistics,
};
