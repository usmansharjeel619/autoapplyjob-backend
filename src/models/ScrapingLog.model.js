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
      // FIXED: Renamed 'errors' to 'errorCount' to avoid mongoose warning
      errorCount: {
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
        errorCount: Number, // Changed from 'errors' to 'errorCount'
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

    // Error details - renamed field to avoid mongoose warning
    errorDetails: [
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
    // FIXED: Add option to suppress reserved keys warning
    suppressReservedKeysWarning: true,
  }
);

// Indexes for better query performance
scrapingLogSchema.index({ user: 1, createdAt: -1 });
scrapingLogSchema.index({ sessionId: 1 });
scrapingLogSchema.index({ status: 1 });
scrapingLogSchema.index({ "timing.startedAt": -1 });

// Static method to get scraping statistics
scrapingLogSchema.statics.getStatistics = async function (userId, period = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - period);

  return await this.aggregate([
    {
      $match: {
        user: userId,
        createdAt: { $gte: startDate },
      },
    },
    {
      $group: {
        _id: null,
        totalRuns: { $sum: 1 },
        successfulRuns: {
          $sum: {
            $cond: [{ $eq: ["$status", "completed"] }, 1, 0],
          },
        },
        totalJobsSaved: { $sum: "$results.jobsSaved" },
        totalJobsFound: { $sum: "$results.totalJobsFound" },
        totalErrors: { $sum: "$results.errorCount" },
        averageDuration: { $avg: "$timing.duration" },
      },
    },
  ]);
};

// Instance method to calculate success rate
scrapingLogSchema.methods.getSuccessRate = function () {
  if (this.results.totalJobsFound === 0) return 0;
  return (this.results.jobsSaved / this.results.totalJobsFound) * 100;
};

// Instance method to mark as completed
scrapingLogSchema.methods.markAsCompleted = function (results) {
  this.status = "completed";
  this.timing.completedAt = new Date();
  this.timing.duration = this.timing.completedAt - this.timing.startedAt;
  this.results = { ...this.results, ...results };
  return this.save();
};

// Instance method to mark as failed
scrapingLogSchema.methods.markAsFailed = function (errorDetails) {
  this.status = "failed";
  this.timing.completedAt = new Date();
  this.timing.duration = this.timing.completedAt - this.timing.startedAt;
  if (errorDetails) {
    this.errorDetails.push(errorDetails);
  }
  return this.save();
};

module.exports = mongoose.model("ScrapingLog", scrapingLogSchema);
