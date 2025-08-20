const User = require("../models/User.model");
const Job = require("../models/Job.model");
const Application = require("../models/Application.model");
const { ApiResponse } = require("../utils/apiResponse");
const { asyncHandler, AppError } = require("../middleware/error.middleware");
const scrapingService = require("../services/scraping.service");
const logger = require("../utils/logger");
const { cleanupOldFiles } = require("../middleware/upload.middleware");
const fs = require("fs");
const path = require("path");

// Get user profile - UPDATED to include resume info
const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    "-password -emailVerificationToken -passwordResetToken"
  );

  if (!user) {
    throw new AppError("User not found", 404);
  }

  // Prepare response with resume info
  const userProfile = user.toObject();

  // Add resume status information
  if (userProfile.resume) {
    userProfile.resumeStatus = {
      hasResume: true,
      parseStatus: userProfile.resume.parseStatus,
      uploadedAt: userProfile.resume.uploadedAt,
      parsedAt: userProfile.resume.parsedAt,
      filename: userProfile.resume.originalName,
      fileSize: userProfile.resume.fileSize,
    };

    // Remove sensitive local path from response
    delete userProfile.resume.localPath;
  } else {
    userProfile.resumeStatus = {
      hasResume: false,
      parseStatus: null,
    };
  }

  ApiResponse.success(res, "Profile retrieved successfully", {
    user: userProfile,
  });
});

// Update user profile
const updateProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const allowedFields = [
    "name",
    "phone",
    "currentJobTitle",
    "experienceLevel",
    "educationLevel",
    "skills",
    "location",
    "bio",
    "linkedinUrl",
    "githubUrl",
    "portfolioUrl",
    "jobPreferences",
  ];

  // Filter only allowed fields
  const updateData = {};
  Object.keys(req.body).forEach((key) => {
    if (allowedFields.includes(key)) {
      updateData[key] = req.body[key];
    }
  });

  const user = await User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
  }).select("-password -emailVerificationToken -passwordResetToken");

  if (!user) {
    throw new AppError("User not found", 404);
  }

  // If profile update includes job preferences, trigger job scraping
  if (req.body.jobPreferences) {
    // Trigger background job scraping
    scrapingService.queueJobScraping(userId).catch((error) => {
      logger.error("Failed to queue job scraping:", error);
    });
  }

  ApiResponse.success(res, "Profile updated successfully", { user });
});

// Upload resume - UPDATED to work with LOCAL STORAGE ONLY
const uploadResume = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError("No file uploaded", 400);
  }

  const userId = req.user._id;
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError("User not found", 404);
  }

  try {
    // Clean up old resume file if it exists
    if (
      user.resume &&
      user.resume.localPath &&
      fs.existsSync(user.resume.localPath)
    ) {
      try {
        fs.unlinkSync(user.resume.localPath);
        logger.info(`Cleaned up old resume file: ${user.resume.localPath}`);
      } catch (cleanupError) {
        logger.warn("Failed to cleanup old resume file:", cleanupError);
      }
    }

    // Save basic file info immediately (LOCAL STORAGE ONLY)
    const resumeData = {
      localPath: req.file.path, // Store local file path
      filename: req.file.filename, // Generated filename
      originalName: req.file.originalname, // Original filename from user
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      uploadedAt: new Date(),
      parseStatus: "pending",
    };

    // Update user with resume information
    user.resume = resumeData;
    await user.save();

    logger.info(
      `Resume file saved locally for user ${userId}: ${req.file.originalname}`
    );

    // Return success response
    ApiResponse.success(res, "Resume uploaded successfully", {
      resumeInfo: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        fileSize: req.file.size,
        uploadedAt: resumeData.uploadedAt,
        parseStatus: "pending",
      },
      message:
        "Resume uploaded successfully. Use the AI parsing endpoint to extract information.",
    });
  } catch (error) {
    logger.error("Resume upload failed:", error);

    // Clean up file on error
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        logger.warn("Failed to cleanup file after error:", cleanupError);
      }
    }

    throw new AppError("Failed to save resume", 500);
  }
});

// Get resume download URL - FIXED METHOD
const downloadResume = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const user = await User.findById(userId);

  if (!user || !user.resume || !user.resume.localPath) {
    throw new AppError("No resume found", 404);
  }

  // Check if file exists
  if (!fs.existsSync(user.resume.localPath)) {
    throw new AppError("Resume file not found on server", 404);
  }

  try {
    // Get file stats for content length
    const stats = fs.statSync(user.resume.localPath);

    // Set appropriate headers for file download
    res.setHeader(
      "Content-Type",
      user.resume.mimeType || "application/octet-stream"
    );
    res.setHeader("Content-Length", stats.size);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(user.resume.originalName)}"`
    );

    // Add cache control headers
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    // Create read stream and pipe to response
    const fileStream = fs.createReadStream(user.resume.localPath);

    // Handle stream errors
    fileStream.on("error", (error) => {
      logger.error("File stream error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: "Error reading file",
        });
      }
    });

    // Pipe the file to response
    fileStream.pipe(res);

    // Log successful download
    logger.info(
      `Resume downloaded by user ${userId}: ${user.resume.originalName}`
    );
  } catch (error) {
    logger.error("Resume download error:", error);
    throw new AppError("Failed to download resume", 500);
  }
});

// Delete resume - UPDATED METHOD
const deleteResume = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError("User not found", 404);
  }

  if (user.resume && user.resume.localPath) {
    // Try to delete the physical file
    try {
      if (fs.existsSync(user.resume.localPath)) {
        fs.unlinkSync(user.resume.localPath);
        logger.info(`Resume file deleted: ${user.resume.localPath}`);
      }
    } catch (fileError) {
      logger.warn(`Failed to delete resume file: ${fileError.message}`);
      // Continue with database cleanup even if file deletion fails
    }
  }

  // Clear resume data from database
  user.resume = undefined;
  await user.save();

  logger.info(`Resume data cleared for user ${userId}`);

  ApiResponse.success(res, "Resume deleted successfully");
});

// Get dashboard statistics
const getDashboardStats = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  // Get application statistics
  const applicationStats = await Application.getStatistics(userId);

  // Get recent applications
  const recentApplications = await Application.find({ user: userId })
    .populate("job", "title company location")
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();

  // Get recommended jobs (high match score, not applied)
  const recommendedJobs = await Job.find({
    targetUser: userId,
    matchScore: { $gte: 70 },
    applicationStatus: "not_applied",
    adminReviewStatus: "approved",
    status: "active",
  })
    .sort({ matchScore: -1 })
    .limit(5)
    .lean();

  // Get upcoming interviews
  const upcomingInterviews = await Application.find({
    user: userId,
    status: "interview_scheduled",
    "interview.scheduledAt": { $gte: new Date() },
  })
    .populate("job", "title company")
    .sort({ "interview.scheduledAt": 1 })
    .lean();

  // Calculate profile completeness
  const user = await User.findById(userId);
  const profileCompleteness = user.profileCompleteness;

  // Calculate response rate
  const totalApplications =
    applicationStats.applied + applicationStats.rejected_by_employer;
  const responses =
    applicationStats.interview_scheduled +
    applicationStats.offer_received +
    applicationStats.rejected_by_employer;
  const responseRate =
    totalApplications > 0
      ? Math.round((responses / totalApplications) * 100)
      : 0;

  const dashboardData = {
    stats: {
      totalApplications: applicationStats.total,
      pendingApplications: applicationStats.pending_review,
      scheduledInterviews: applicationStats.interview_scheduled,
      jobMatches: await Job.countDocuments({
        targetUser: userId,
        matchScore: { $gte: 70 },
        status: "active",
      }),
      profileCompleteness,
      responseRate,
      applicationsTrend: 0, // You can implement this based on week-over-week data
    },
    recentApplications: recentApplications.map((app) => ({
      id: app._id,
      jobTitle: app.job.title,
      company: app.job.company,
      status: app.status,
      appliedAt: app.appliedAt || app.createdAt,
      matchScore: app.matchScore,
    })),
    recommendedJobs,
    upcomingInterviews: upcomingInterviews.map((app) => ({
      id: app._id,
      jobTitle: app.job.title,
      company: app.job.company,
      scheduledAt: app.interview.scheduledAt,
      type: app.interview.type,
      meetingLink: app.interview.meetingLink,
    })),
  };

  ApiResponse.success(
    res,
    "Dashboard data retrieved successfully",
    dashboardData
  );
});

// Get user's jobs (scraped for this user)
const getJobs = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const {
    page = 1,
    pageSize = 20,
    sortBy = "matchScore",
    sortOrder = "desc",
    status,
    adminReviewStatus = "approved",
  } = req.query;

  const skip = (page - 1) * pageSize;
  const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

  // Build filter
  const filter = {
    targetUser: userId,
    isActive: true,
    adminReviewStatus,
  };

  if (status) {
    filter.applicationStatus = status;
  }

  // Get jobs with pagination
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
  });
});

// Get saved jobs
const getSavedJobs = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, pageSize = 20 } = req.query;

  const skip = (page - 1) * pageSize;

  // For now, we'll return jobs that user has applied to or marked as interesting
  // In a full implementation, you might have a separate SavedJobs model
  const savedApplications = await Application.find({
    user: userId,
    status: { $in: ["applied", "pending_review", "approved"] },
  })
    .populate("job")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(pageSize))
    .lean();

  const total = await Application.countDocuments({
    user: userId,
    status: { $in: ["applied", "pending_review", "approved"] },
  });

  const savedJobs = savedApplications
    .map((app) => app.job)
    .filter((job) => job);

  ApiResponse.success(res, "Saved jobs retrieved successfully", {
    jobs: savedJobs,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});

// Save a job (create application with pending_review status)
const saveJob = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { jobId } = req.params;

  // Check if job exists
  const job = await Job.findById(jobId);
  if (!job) {
    throw new AppError("Job not found", 404);
  }

  // Check if job belongs to this user
  if (job.targetUser.toString() !== userId.toString()) {
    throw new AppError("You can only save jobs targeted to you", 403);
  }

  // Check if already applied or saved
  const existingApplication = await Application.findOne({
    user: userId,
    job: jobId,
  });

  if (existingApplication) {
    throw new AppError("You have already saved or applied to this job", 409);
  }

  // Create application with pending_review status
  const application = new Application({
    user: userId,
    job: jobId,
    matchScore: job.matchScore,
    status: "pending_review",
  });

  await application.save();

  ApiResponse.success(res, "Job saved successfully");
});

// Unsave a job (remove application if status is pending_review)
const unsaveJob = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { jobId } = req.params;

  const application = await Application.findOne({
    user: userId,
    job: jobId,
    status: "pending_review",
  });

  if (!application) {
    throw new AppError("Job not found in your saved list", 404);
  }

  await application.deleteOne();

  ApiResponse.success(res, "Job removed from saved list");
});

// Get application history
const getApplicationHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { page = 1, pageSize = 20, status, sortBy = "createdAt" } = req.query;

  const skip = (page - 1) * pageSize;
  const sort = { [sortBy]: -1 };

  // Build filter
  const filter = { user: userId };
  if (status) {
    filter.status = status;
  }

  // Get applications with pagination
  const [applications, total] = await Promise.all([
    Application.find(filter)
      .populate("job", "title company location salary")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(pageSize))
      .lean(),
    Application.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  ApiResponse.success(res, "Application history retrieved successfully", {
    applications,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  });
});

// Get user settings
const getSettings = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    "name email preferences notifications jobPreferences"
  );

  ApiResponse.success(res, "Settings retrieved successfully", {
    settings: {
      profile: {
        name: user.name,
        email: user.email,
      },
      jobPreferences: user.jobPreferences,
      notifications: user.notifications || {
        email: true,
        push: true,
        sms: false,
      },
      preferences: user.preferences || {
        autoApply: true,
        privacyLevel: "medium",
      },
    },
  });
});

// Update user settings
const updateSettings = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { jobPreferences, notifications, preferences } = req.body;

  const updateData = {};
  if (jobPreferences) updateData.jobPreferences = jobPreferences;
  if (notifications) updateData.notifications = notifications;
  if (preferences) updateData.preferences = preferences;

  const user = await User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
  }).select("jobPreferences notifications preferences");

  ApiResponse.success(res, "Settings updated successfully", {
    settings: user,
  });
});

// Complete onboarding step
const completeOnboardingStep = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { step } = req.params;
  const stepData = req.body;

  const validSteps = ["basic_info", "resume_upload", "job_preferences"];
  if (!validSteps.includes(step)) {
    throw new AppError("Invalid onboarding step", 400);
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("User not found", 404);
  }

  // Update user based on step
  switch (step) {
    case "basic_info":
      user.name = stepData.name || user.name;
      user.phone = stepData.phone || user.phone;
      user.currentJobTitle = stepData.currentJobTitle || user.currentJobTitle;
      user.experienceLevel = stepData.experienceLevel || user.experienceLevel;
      user.educationLevel = stepData.educationLevel || user.educationLevel;
      user.location = stepData.location || user.location;
      user.bio = stepData.bio || user.bio;
      user.skills = stepData.skills || user.skills;
      break;

    case "resume_upload":
      // Resume upload is handled separately
      break;

    case "job_preferences":
      user.jobPreferences = {
        ...user.jobPreferences,
        ...stepData,
      };
      break;
  }

  // Update onboarding step
  const stepOrder = ["basic_info", "resume_upload", "job_preferences"];
  const currentStepIndex = stepOrder.indexOf(step);
  const nextStepIndex = currentStepIndex + 1;

  if (nextStepIndex < stepOrder.length) {
    user.onboardingStep = stepOrder[nextStepIndex];
  } else {
    user.onboardingStep = "completed";
    user.onboardingCompleted = true;
  }

  await user.save();

  ApiResponse.success(res, `${step} completed successfully`, {
    nextStep: user.onboardingStep,
    onboardingCompleted: user.onboardingCompleted,
  });
});

// Get onboarding progress
const getOnboardingProgress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    "onboardingStep onboardingCompleted name phone currentJobTitle experienceLevel educationLevel location bio skills resume jobPreferences"
  );

  const progress = {
    currentStep: user.onboardingStep,
    completed: user.onboardingCompleted,
    steps: {
      basic_info: {
        completed: !!(
          user.name &&
          user.phone &&
          user.currentJobTitle &&
          user.experienceLevel &&
          user.educationLevel &&
          user.location
        ),
        data: {
          name: user.name,
          phone: user.phone,
          currentJobTitle: user.currentJobTitle,
          experienceLevel: user.experienceLevel,
          educationLevel: user.educationLevel,
          location: user.location,
          bio: user.bio,
          skills: user.skills,
        },
      },
      resume_upload: {
        completed: !!(user.resume && user.resume.localPath),
        data: user.resume
          ? {
              filename: user.resume.originalName,
              uploadedAt: user.resume.uploadedAt,
              parseStatus: user.resume.parseStatus,
            }
          : null,
      },
      job_preferences: {
        completed: !!(
          user.jobPreferences &&
          user.jobPreferences.desiredRoles &&
          user.jobPreferences.desiredRoles.length > 0
        ),
        data: user.jobPreferences,
      },
    },
  };

  ApiResponse.success(res, "Onboarding progress retrieved successfully", {
    progress,
  });
});

module.exports = {
  getProfile,
  updateProfile,
  uploadResume,
  downloadResume, // Make sure this is exported
  deleteResume, // Make sure this is exported
  getDashboardStats,
  getJobs,
  getSavedJobs,
  saveJob,
  unsaveJob,
  getApplicationHistory,
  getSettings,
  updateSettings,
  completeOnboardingStep,
  getOnboardingProgress,
};
