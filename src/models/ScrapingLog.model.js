const mongoose = require("mongoose");

const scrapingLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Scraping session details
    sessionId: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["initiated", "in_progress", "completed", "failed", "cancelled"],
      default: "initiated",
    },

    // Scraping parameters sent to Python service
    searchCriteria: {
      jobTitle: String,
      location: String,
      experience: String,
      skills: [String],
      jobTypes: [String],
      workTypes: [String],
      industries: [String],
      salaryRange: {
        min: Number,
        max: Number,
      },
    },

    // Results from Python service
    results: {
      totalJobsFound: {
        type: Number,
        default: 0,
      },
      jobsSaved: {
        type: Number,
        default: 0,
      },
      duplicatesSkipped: {
        type: Number,
        default: 0,
      },
      errors: {
        type: Number,
        default: 0,
      },
    },

    // Platform-wise breakdown
    platformResults: [
      {
        platform: {
          type: String,
          enum: [
            "linkedin",
            "indeed",
            "glassdoor",
            "monster",
            "ziprecruiter",
            "careerbuilder",
          ],
        },
        jobsFound: Number,
        jobsSaved: Number,
        errors: Number,
        processingTime: Number, // in milliseconds
      },
    ],

    // Timing information
    timing: {
      startedAt: {
        type: Date,
        default: Date.now,
      },
      completedAt: Date,
      duration: Number, // in milliseconds
      timeoutOccurred: {
        type: Boolean,
        default: false,
      },
    },

    // Error details
    errors: [
      {
        platform: String,
        errorType: String,
        errorMessage: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
        stackTrace: String,
      },
    ],

    // Python service response details
    pythonServiceResponse: {
      statusCode: Number,
      responseTime: Number,
      requestId: String,
    },

    // Jobs created from this scraping session
    jobsCreated: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Job",
      },
    ],

    // Metadata
    triggeredBy: {
      type: String,
      enum: ["manual", "scheduled", "user_profile_update", "package_purchase"],
      default: "manual",
    },
    ipAddress: String,
    userAgent: String,
  },
  {
    timestamps: true,
  }
);

// Indexes
scrapingLogSchema.index({ user: 1 });
scrapingLogSchema.index({ status: 1 });
scrapingLogSchema.index({ sessionId: 1 });
scrapingLogSchema.index({ "timing.startedAt": -1 });

// Static method to get scraping statistics
scrapingLogSchema.statics.getStatistics = async function (
  userId = null,
  timeframe = 30
) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - timeframe);

  const matchStage = {
    "timing.startedAt": { $gte: startDate },
  };

  if (userId) {
    matchStage.user = new mongoose.Types.ObjectId(userId);
  }

  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalSessions: { $sum: 1 },
        completedSessions: {
          $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
        },
        totalJobsFound: { $sum: "$results.totalJobsFound" },
        totalJobsSaved: { $sum: "$results.jobsSaved" },
        averageDuration: { $avg: "$timing.duration" },
        totalErrors: { $sum: "$results.errors" },
      },
    },
  ]);

  return (
    stats[0] || {
      totalSessions: 0,
      completedSessions: 0,
      totalJobsFound: 0,
      totalJobsSaved: 0,
      averageDuration: 0,
      totalErrors: 0,
    }
  );
};

module.exports = mongoose.model("ScrapingLog", scrapingLogSchema);
