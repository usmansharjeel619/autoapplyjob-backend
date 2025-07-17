import { apiGet, apiPost } from "./api";
import { API_ENDPOINTS } from "../utils/constants";

class JobService {
  async searchJobs(params = {}) {
    const response = await apiGet(API_ENDPOINTS.JOBS.SEARCH, { params });
    return response.data;
  }

  async getJobDetails(jobId) {
    const url = API_ENDPOINTS.JOBS.DETAILS.replace(":id", jobId);
    const response = await apiGet(url);
    return response.data;
  }

  async applyToJob(jobId, applicationData = {}) {
    const url = API_ENDPOINTS.JOBS.APPLY.replace(":id", jobId);
    const response = await apiPost(url, applicationData);
    return response.data;
  }

  async getScrapedJobs(userId, params = {}) {
    const response = await apiGet(
      `${API_ENDPOINTS.JOBS.SCRAPED_JOBS}/${userId}`,
      { params }
    );
    return response.data;
  }

  // Job filtering and sorting utilities
  filterJobs(jobs, filters) {
    return jobs.filter((job) => {
      // Location filter
      if (
        filters.location &&
        !job.location.toLowerCase().includes(filters.location.toLowerCase())
      ) {
        return false;
      }

      // Job type filter
      if (filters.jobType && job.jobType !== filters.jobType) {
        return false;
      }

      // Work type filter
      if (filters.workType && job.workType !== filters.workType) {
        return false;
      }

      // Industry filter
      if (filters.industry && job.industry !== filters.industry) {
        return false;
      }

      // Salary range filter
      if (
        filters.minSalary &&
        job.salary &&
        job.salary.min < parseInt(filters.minSalary)
      ) {
        return false;
      }

      if (
        filters.maxSalary &&
        job.salary &&
        job.salary.max > parseInt(filters.maxSalary)
      ) {
        return false;
      }

      // Match score filter
      if (filters.minMatchScore && job.matchScore < filters.minMatchScore) {
        return false;
      }

      // Date posted filter
      if (filters.datePosted) {
        const daysAgo = parseInt(filters.datePosted);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysAgo);

        if (new Date(job.postedDate) < cutoffDate) {
          return false;
        }
      }

      return true;
    });
  }

  sortJobs(jobs, sortBy) {
    return [...jobs].sort((a, b) => {
      switch (sortBy) {
        case "relevance":
          return b.matchScore - a.matchScore;
        case "date":
          return new Date(b.postedDate) - new Date(a.postedDate);
        case "salary":
          const aSalary = a.salary?.max || a.salary?.min || 0;
          const bSalary = b.salary?.max || b.salary?.min || 0;
          return bSalary - aSalary;
        case "company":
          return a.company.localeCompare(b.company);
        default:
          return 0;
      }
    });
  }
}

export default new JobService();
