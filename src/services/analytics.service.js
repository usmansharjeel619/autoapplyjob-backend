const User = require("../models/User.model");
const Job = require("../models/Job.model");
const Application = require("../models/Application.model");
const ScrapingLog = require("../models/ScrapingLog.model");
const logger = require("../utils/logger");
const moment = require("moment");

class AnalyticsService {
  // Get analytics data based on period
  async getAnalytics(period = "30d") {
    try {
      const periodData = this.getPeriodDates(period);

      const [
        userAnalytics,
        applicationAnalytics,
        jobAnalytics,
        scrapingAnalytics,
        trendsData,
      ] = await Promise.all([
        this.getUserAnalytics(periodData),
        this.getApplicationAnalytics(periodData),
        this.getJobAnalytics(periodData),
        this.getScrapingAnalytics(periodData),
        this.getTrendsData(periodData),
      ]);

      return {
        period,
        dateRange: periodData,
        users: userAnalytics,
        applications: applicationAnalytics,
        jobs: jobAnalytics,
        scraping: scrapingAnalytics,
        trends: trendsData,
        generatedAt: new Date(),
      };
    } catch (error) {
      logger.error("Error generating analytics:", error);
      throw new Error("Failed to generate analytics data");
    }
  }

  // Get period date range
  getPeriodDates(period) {
    const now = moment();
    let startDate;

    switch (period) {
      case "7d":
        startDate = moment().subtract(7, "days");
        break;
      case "30d":
        startDate = moment().subtract(30, "days");
        break;
      case "90d":
        startDate = moment().subtract(90, "days");
        break;
      case "1y":
        startDate = moment().subtract(1, "year");
        break;
      default:
        startDate = moment().subtract(30, "days");
    }

    return {
      startDate: startDate.toDate(),
      endDate: now.toDate(),
      periodDays: now.diff(startDate, "days"),
    };
  }

  // Get user analytics
  async getUserAnalytics(periodData) {
    const { startDate, endDate } = periodData;

    const [totalUsers, newUsers, activeUsers, usersByType, userGrowth] =
      await Promise.all([
        User.countDocuments({ userType: "user" }),
        User.countDocuments({
          userType: "user",
          createdAt: { $gte: startDate, $lte: endDate },
        }),
        User.countDocuments({
          userType: "user",
          lastLogin: { $gte: startDate, $lte: endDate },
        }),
        User.aggregate([
          { $match: { userType: { $ne: "admin" } } },
          { $group: { _id: "$userType", count: { $sum: 1 } } },
        ]),
        this.getUserGrowthData(startDate, endDate),
      ]);

    return {
      total: totalUsers,
      new: newUsers,
      active: activeUsers,
      byType: usersByType,
      growth: userGrowth,
    };
  }

  // Get application analytics
  async getApplicationAnalytics(periodData) {
    const { startDate, endDate } = periodData;

    const [
      totalApplications,
      newApplications,
      applicationsByStatus,
      successRate,
      applicationTrends,
    ] = await Promise.all([
      Application.countDocuments(),
      Application.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate },
      }),
      Application.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      this.getApplicationSuccessRate(startDate, endDate),
      this.getApplicationTrends(startDate, endDate),
    ]);

    return {
      total: totalApplications,
      new: newApplications,
      byStatus: applicationsByStatus,
      successRate,
      trends: applicationTrends,
    };
  }

  // Get job analytics
  async getJobAnalytics(periodData) {
    const { startDate, endDate } = periodData;

    const [totalJobs, newJobs, jobsByStatus, topCompanies, jobTrends] =
      await Promise.all([
        Job.countDocuments(),
        Job.countDocuments({
          createdAt: { $gte: startDate, $lte: endDate },
        }),
        Job.aggregate([
          { $group: { _id: "$adminReviewStatus", count: { $sum: 1 } } },
        ]),
        this.getTopCompanies(startDate, endDate),
        this.getJobTrends(startDate, endDate),
      ]);

    return {
      total: totalJobs,
      new: newJobs,
      byStatus: jobsByStatus,
      topCompanies,
      trends: jobTrends,
    };
  }

  // Get scraping analytics
  async getScrapingAnalytics(periodData) {
    const { startDate, endDate } = periodData;

    const [
      totalScrapingRuns,
      successfulRuns,
      totalJobsScraped,
      scrapingTrends,
    ] = await Promise.all([
      ScrapingLog.countDocuments({
        createdAt: { $gte: startDate, $lte: endDate },
      }),
      ScrapingLog.countDocuments({
        status: "completed",
        createdAt: { $gte: startDate, $lte: endDate },
      }),
      ScrapingLog.aggregate([
        {
          $match: {
            createdAt: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: null,
            totalJobs: { $sum: "$totalJobsSaved" },
          },
        },
      ]),
      this.getScrapingTrends(startDate, endDate),
    ]);

    const totalJobs = totalJobsScraped[0]?.totalJobs || 0;
    const successRate =
      totalScrapingRuns > 0 ? (successfulRuns / totalScrapingRuns) * 100 : 0;

    return {
      totalRuns: totalScrapingRuns,
      successfulRuns,
      totalJobsScraped: totalJobs,
      successRate: Math.round(successRate * 100) / 100,
      trends: scrapingTrends,
    };
  }

  // Get trends data
  async getTrendsData(periodData) {
    const { startDate, endDate } = periodData;

    return {
      userRegistrations: await this.getUserGrowthData(startDate, endDate),
      applications: await this.getApplicationTrends(startDate, endDate),
      jobs: await this.getJobTrends(startDate, endDate),
    };
  }

  // Get user growth data
  async getUserGrowthData(startDate, endDate) {
    return await User.aggregate([
      {
        $match: {
          userType: "user",
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);
  }

  // Get application trends
  async getApplicationTrends(startDate, endDate) {
    return await Application.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);
  }

  // Get job trends
  async getJobTrends(startDate, endDate) {
    return await Job.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);
  }

  // Get scraping trends
  async getScrapingTrends(startDate, endDate) {
    return await ScrapingLog.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          runs: { $sum: 1 },
          jobsScraped: { $sum: "$totalJobsSaved" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);
  }

  // Get application success rate
  async getApplicationSuccessRate(startDate, endDate) {
    const results = await Application.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          successful: {
            $sum: {
              $cond: [
                {
                  $in: [
                    "$status",
                    ["interview_scheduled", "offer_received", "hired"],
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    const data = results[0] || { total: 0, successful: 0 };
    const rate = data.total > 0 ? (data.successful / data.total) * 100 : 0;

    return {
      total: data.total,
      successful: data.successful,
      rate: Math.round(rate * 100) / 100,
    };
  }

  // Get top companies
  async getTopCompanies(startDate, endDate, limit = 10) {
    return await Job.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: "$company",
          jobCount: { $sum: 1 },
          applications: {
            $sum: {
              $cond: [
                { $gt: ["$applicationCount", 0] },
                "$applicationCount",
                0,
              ],
            },
          },
        },
      },
      { $sort: { jobCount: -1 } },
      { $limit: limit },
    ]);
  }
}

module.exports = new AnalyticsService();
