const User = require("../models/User.model");
const Job = require("../models/Job.model");
const Application = require("../models/Application.model");
const { ApiResponse } = require("../utils/apiResponse");
const { asyncHandler, AppError } = require("../middleware/error.middleware");
const uploadService = require("../services/upload.service");
const scrapingService = require("../services/scraping.service");
const logger = require("../utils/logger");
const { cleanupOldFiles } = require("../middleware/upload.middleware");

// Get user profile
const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    "-password -emailVerificationToken -passwordResetToken"
  );

  if (!user) {
    throw new AppError("User not found", 404);
  }

  ApiResponse.success(res, "Profile retrieved successfully", { user });
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
    scrapingService
      .scheduleJobScraping(userId)
      .catch((err) => logger.error("Failed to schedule job scraping:", err));
  }

  ApiResponse.success(res, "Profile updated successfully", { user });
});

// Upload resume
const uploadResume = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError("Please upload a resume file", 400);
  }

  const userId = req.user._id;
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError("User not found", 404);
  }

  try {
    // Upload to cloud storage (Cloudinary)
    const uploadResult = await uploadService.uploadFile(req.file);

    // Clean up old resume file if exists
    if (user.resume && user.resume.cloudinaryPublicId) {
      await uploadService.deleteFile(user.resume.cloudinaryPublicId);
    }

    // Update user with new resume info
    user.resume = {
      fileName: uploadResult.public_id,
      originalName: req.file.originalname,
      url: uploadResult.secure_url,
      cloudinaryPublicId: uploadResult.public_id,
      uploadedAt: new Date(),
    };

    await user.save();

    // Clean up local file
    cleanupOldFiles(req.file.path);

    ApiResponse.success(res, "Resume uploaded successfully", {
      resume: user.resume,
    });
  } catch (error) {
    // Clean up local file on error
    cleanupOldFiles(req.file.path);
    logger.error("Resume upload error:", error);
    throw new AppError("Failed to upload resume", 500);
  }
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
      applicationsTrend: 0, // Calculate based on previous period if needed
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
    filter.status = status;
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
    throw new AppError("Job not found", 404);
  }

  // Check if already applied or saved
  const existingApplication = await Application.findOne({
    user: userId,
    job: jobId,
  });

  if (existingApplication) {
    throw new AppError("Job already saved/applied", 400);
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
    throw new AppError("Saved job not found", 404);
  }

  await application.deleteOne();

  ApiResponse.success(res, "Job removed from saved list");
});

// Get application history
const getApplicationHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const {
    page = 1,
    pageSize = 20,
    status,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  const skip = (page - 1) * pageSize;
  const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

  // Build filter
  const filter = { user: userId };
  if (status) {
    filter.status = status;
  }

  // Get applications with job details
  const [applications, total] = await Promise.all([
    Application.find(filter)
      .populate("job", "title company location workType jobType salary")
      .populate("reviewedBy", "name")
      .populate("appliedBy", "name")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(pageSize))
      .lean(),
    Application.countDocuments(filter),
  ]);

  ApiResponse.success(res, "Application history retrieved successfully", {
    applications,
    pagination: {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});

// Get user settings
const getSettings = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .select("jobPreferences package")
    .lean();

  if (!user) {
    throw new AppError("User not found", 404);
  }

  ApiResponse.success(res, "Settings retrieved successfully", {
    settings: {
      jobPreferences: user.jobPreferences,
      package: user.package,
    },
  });
});

// Update user settings
const updateSettings = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { jobPreferences, autoApplyEnabled } = req.body;

  const updateData = {};

  if (jobPreferences) {
    updateData.jobPreferences = jobPreferences;
  }

  if (typeof autoApplyEnabled === "boolean") {
    updateData["jobPreferences.autoApplyEnabled"] = autoApplyEnabled;
  }

  const user = await User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
  }).select("jobPreferences");

  if (!user) {
    throw new AppError("User not found", 404);
  }

  // If job preferences changed, trigger new job scraping
  if (jobPreferences) {
    scrapingService
      .scheduleJobScraping(userId)
      .catch((err) => logger.error("Failed to schedule job scraping:", err));
  }

  ApiResponse.success(res, "Settings updated successfully", {
    settings: {
      jobPreferences: user.jobPreferences,
    },
  });
});

// Complete onboarding step
const completeOnboardingStep = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { step } = req.params;
  const stepData = req.body;

  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("User not found", 404);
  }

  // Update user data based on step
  switch (step) {
    case "basic_info":
      Object.assign(user, {
        name: stepData.name || user.name,
        phone: stepData.phone || user.phone,
        currentJobTitle: stepData.currentJobTitle || user.currentJobTitle,
        experienceLevel: stepData.experienceLevel || user.experienceLevel,
        educationLevel: stepData.educationLevel || user.educationLevel,
      });
      user.onboardingStep = "resume_upload";
      break;

    case "job_preferences":
      user.jobPreferences = {
        ...user.jobPreferences,
        ...stepData,
      };
      user.onboardingStep = "completed";
      user.onboardingCompleted = true;
      break;

    default:
      throw new AppError("Invalid onboarding step", 400);
  }

  await user.save();

  // If onboarding completed, trigger initial job scraping
  if (user.onboardingCompleted) {
    scrapingService
      .scheduleJobScraping(userId)
      .catch((err) =>
        logger.error("Failed to schedule initial job scraping:", err)
      );
  }

  ApiResponse.success(res, "Onboarding step completed successfully", {
    user: {
      onboardingStep: user.onboardingStep,
      onboardingCompleted: user.onboardingCompleted,
    },
  });
});

// Get onboarding progress
const getOnboardingProgress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id)
    .select("onboardingStep onboardingCompleted")
    .lean();

  if (!user) {
    throw new AppError("User not found", 404);
  }

  ApiResponse.success(res, "Onboarding progress retrieved successfully", {
    onboardingStep: user.onboardingStep,
    onboardingCompleted: user.onboardingCompleted,
  });
});

module.exports = {
  getProfile,
  updateProfile,
  uploadResume,
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
