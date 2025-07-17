const axios = require("axios");
const User = require("../models/User.model");
const Job = require("../models/Job.model");
const ScrapingLog = require("../models/ScrapingLog.model");
const { v4: uuidv4 } = require("uuid");
const logger = require("../utils/logger");

class ScrapingService {
  constructor() {
    this.pythonServiceUrl =
      process.env.PYTHON_SCRAPER_URL || "http://localhost:8000";
    this.apiKey = process.env.PYTHON_SCRAPER_API_KEY;
  }

  // Schedule job scraping for a user
  async scheduleJobScraping(userId, triggeredBy = "manual") {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Check if user has completed onboarding
      if (!user.onboardingCompleted) {
        logger.info(
          `Skipping job scraping for user ${userId} - onboarding not completed`
        );
        return;
      }

      // Check if user's package allows job scraping
      if (!this.canUserScrapeJobs(user)) {
        logger.info(
          `Skipping job scraping for user ${userId} - package limits exceeded`
        );
        return;
      }

      // Create scraping session
      const sessionId = uuidv4();
      const scrapingLog = new ScrapingLog({
        user: userId,
        sessionId,
        status: "initiated",
        triggeredBy,
        searchCriteria: this.buildSearchCriteria(user),
      });
      await scrapingLog.save();

      // Start scraping process
      this.performJobScraping(sessionId, user, scrapingLog);

      return sessionId;
    } catch (error) {
      logger.error("Error scheduling job scraping:", error);
      throw error;
    }
  }

  // Check if user can scrape jobs based on package limits
  canUserScrapeJobs(user) {
    // Check package expiry
    if (user.package.expiresAt && user.package.expiresAt < new Date()) {
      return false;
    }

    // For basic implementation, allow all users
    // In production, implement package-based limits
    return true;
  }

  // Build search criteria from user profile and preferences
  buildSearchCriteria(user) {
    const criteria = {
      jobTitle: user.currentJobTitle || "",
      location: user.location || "",
      experience: user.experienceLevel || "",
      skills: user.skills || [],
      jobTypes: user.jobPreferences?.preferredJobTypes || ["full_time"],
      workTypes: user.jobPreferences?.preferredWorkTypes || [
        "remote",
        "hybrid",
      ],
      industries: user.jobPreferences?.preferredIndustries || [],
      salaryRange: {
        min: user.jobPreferences?.minSalary || 0,
        max: user.jobPreferences?.maxSalary || 0,
      },
    };

    return criteria;
  }

  // Perform actual job scraping
  async performJobScraping(sessionId, user, scrapingLog) {
    try {
      // Update status to in_progress
      scrapingLog.status = "in_progress";
      await scrapingLog.save();

      logger.info(
        `Starting job scraping for user ${user._id}, session ${sessionId}`
      );

      // Prepare request to Python service
      const requestPayload = {
        sessionId,
        userId: user._id.toString(),
        searchCriteria: scrapingLog.searchCriteria,
        userProfile: {
          name: user.name,
          email: user.email,
          skills: user.skills,
          experience: user.experienceLevel,
          location: user.location,
          currentJobTitle: user.currentJobTitle,
        },
        settings: {
          maxJobsPerPlatform: 50,
          platforms: ["linkedin", "indeed", "glassdoor"],
          timeout: 300000, // 5 minutes
        },
      };

      // Call Python scraping service
      const response = await axios.post(
        `${this.pythonServiceUrl}/api/scrape-jobs`,
        requestPayload,
        {
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": this.apiKey,
          },
          timeout: 300000, // 5 minutes timeout
        }
      );

      logger.info(
        `Python service response for session ${sessionId}:`,
        response.status
      );

      // Process the response
      await this.processScrapingResults(
        sessionId,
        user._id,
        response.data,
        scrapingLog
      );
    } catch (error) {
      logger.error(`Job scraping failed for session ${sessionId}:`, error);

      // Update scraping log with error
      scrapingLog.status = "failed";
      scrapingLog.errors.push({
        errorType: "SCRAPING_ERROR",
        errorMessage: error.message,
        timestamp: new Date(),
        stackTrace: error.stack,
      });
      scrapingLog.timing.completedAt = new Date();
      scrapingLog.timing.duration =
        Date.now() - scrapingLog.timing.startedAt.getTime();

      await scrapingLog.save();
    }
  }

  // Process results from Python scraping service
  async processScrapingResults(
    sessionId,
    userId,
    scrapingResults,
    scrapingLog
  ) {
    try {
      logger.info(`Processing scraping results for session ${sessionId}`);

      const { jobs, platformResults, totalJobsFound, errors } = scrapingResults;

      let jobsSaved = 0;
      let duplicatesSkipped = 0;
      const jobsCreated = [];

      // Process each job
      for (const jobData of jobs || []) {
        try {
          // Check for duplicates (same company + title + location)
          const existingJob = await Job.findOne({
            targetUser: userId,
            title: jobData.title,
            company: jobData.company,
            location: jobData.location,
          });

          if (existingJob) {
            duplicatesSkipped++;
            continue;
          }

          // Get user for match score calculation
          const user = await User.findById(userId);

          // Create job document
          const job = new Job({
            title: jobData.title,
            company: jobData.company,
            location: jobData.location,
            workType: jobData.workType || "onsite",
            jobType: jobData.jobType || "full_time",
            salary: {
              min: jobData.salary?.min || 0,
              max: jobData.salary?.max || 0,
              currency: jobData.salary?.currency || "USD",
              period: jobData.salary?.period || "yearly",
            },
            description: jobData.description || "",
            requirements: jobData.requirements || [],
            responsibilities: jobData.responsibilities || [],
            skills: jobData.skills || [],
            benefits: jobData.benefits || [],
            industry: jobData.industry || "",
            companySize: jobData.companySize || "",
            applyUrl: jobData.applyUrl,
            companyUrl: jobData.companyUrl,
            scrapedFrom: {
              platform: jobData.platform || "unknown",
              originalId: jobData.originalId || "",
              scrapedAt: new Date(),
            },
            targetUser: userId,
            postedDate: jobData.postedDate
              ? new Date(jobData.postedDate)
              : new Date(),
            expiryDate: jobData.expiryDate
              ? new Date(jobData.expiryDate)
              : null,
            status: "active",
            adminReviewStatus: "pending",
          });

          // Calculate match score
          job.matchScore = Job.calculateMatchScore(job, user);

          // Save job
          await job.save();
          jobsCreated.push(job._id);
          jobsSaved++;

          logger.debug(
            `Created job ${job._id} for user ${userId} with match score ${job.matchScore}`
          );
        } catch (jobError) {
          logger.error(
            `Error creating job for session ${sessionId}:`,
            jobError
          );
          scrapingLog.errors.push({
            errorType: "JOB_CREATION_ERROR",
            errorMessage: jobError.message,
            timestamp: new Date(),
          });
        }
      }

      // Update scraping log with results
      scrapingLog.status = "completed";
      scrapingLog.results = {
        totalJobsFound: totalJobsFound || 0,
        jobsSaved,
        duplicatesSkipped,
        errors: errors?.length || 0,
      };
      scrapingLog.platformResults = platformResults || [];
      scrapingLog.jobsCreated = jobsCreated;
      scrapingLog.timing.completedAt = new Date();
      scrapingLog.timing.duration =
        Date.now() - scrapingLog.timing.startedAt.getTime();

      if (errors && errors.length > 0) {
        scrapingLog.errors.push(
          ...errors.map((error) => ({
            platform: error.platform,
            errorType: error.type,
            errorMessage: error.message,
            timestamp: new Date(),
          }))
        );
      }

      await scrapingLog.save();

      // Update user's last scraping run
      await User.findByIdAndUpdate(userId, {
        lastJobScrapingRun: new Date(),
      });

      logger.info(
        `Scraping completed for session ${sessionId}: ${jobsSaved} jobs saved, ${duplicatesSkipped} duplicates skipped`
      );
    } catch (error) {
      logger.error(
        `Error processing scraping results for session ${sessionId}:`,
        error
      );
      throw error;
    }
  }

  // Get scraping history for a user
  async getScrapingHistory(userId, page = 1, pageSize = 10) {
    const skip = (page - 1) * pageSize;

    const [logs, total] = await Promise.all([
      ScrapingLog.find({ user: userId })
        .sort({ "timing.startedAt": -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      ScrapingLog.countDocuments({ user: userId }),
    ]);

    return {
      logs,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  // Get scraping statistics
  async getScrapingStatistics(userId = null, timeframe = 30) {
    return await ScrapingLog.getStatistics(userId, timeframe);
  }

  // Manually trigger job scraping for a user
  async triggerManualScraping(userId, adminId = null) {
    try {
      const sessionId = await this.scheduleJobScraping(userId, "manual");

      logger.info(
        `Manual job scraping triggered for user ${userId} by ${
          adminId || "system"
        }, session ${sessionId}`
      );

      return sessionId;
    } catch (error) {
      logger.error(
        `Error triggering manual scraping for user ${userId}:`,
        error
      );
      throw error;
    }
  }

  // Cancel ongoing scraping session
  async cancelScraping(sessionId) {
    try {
      const scrapingLog = await ScrapingLog.findOne({ sessionId });
      if (!scrapingLog) {
        throw new Error("Scraping session not found");
      }

      if (
        scrapingLog.status === "completed" ||
        scrapingLog.status === "failed"
      ) {
        throw new Error("Cannot cancel completed or failed scraping session");
      }

      // Update status to cancelled
      scrapingLog.status = "cancelled";
      scrapingLog.timing.completedAt = new Date();
      scrapingLog.timing.duration =
        Date.now() - scrapingLog.timing.startedAt.getTime();
      await scrapingLog.save();

      // Optionally, call Python service to cancel the scraping
      try {
        await axios.post(
          `${this.pythonServiceUrl}/api/cancel-scraping`,
          { sessionId },
          {
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": this.apiKey,
            },
            timeout: 10000,
          }
        );
      } catch (cancelError) {
        logger.warn(
          `Failed to cancel scraping on Python service: ${cancelError.message}`
        );
      }

      logger.info(`Scraping session ${sessionId} cancelled`);
      return true;
    } catch (error) {
      logger.error(`Error cancelling scraping session ${sessionId}:`, error);
      throw error;
    }
  }

  // Health check for Python scraping service
  async checkScrapingServiceHealth() {
    try {
      const response = await axios.get(`${this.pythonServiceUrl}/health`, {
        timeout: 5000,
      });

      return {
        status: "healthy",
        responseTime: response.headers["x-response-time"],
        version: response.data.version,
      };
    } catch (error) {
      return {
        status: "unhealthy",
        error: error.message,
      };
    }
  }
}

module.exports = new ScrapingService();
