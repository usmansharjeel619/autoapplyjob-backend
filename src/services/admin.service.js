import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from "./api";
import { API_ENDPOINTS } from "../utils/constants";

class AdminService {
  // Dashboard & Analytics
  async getDashboardStats() {
    const response = await apiGet(API_ENDPOINTS.ADMIN.DASHBOARD);
    return response.data;
  }

  async getAnalytics(period = "30d") {
    const response = await apiGet(
      `${API_ENDPOINTS.ADMIN.ANALYTICS}?period=${period}`
    );
    return response.data;
  }

  // User Management
  async getAllUsers(params = {}) {
    const response = await apiGet(API_ENDPOINTS.ADMIN.USERS, { params });
    return response.data;
  }

  async getUser(userId) {
    const response = await apiGet(`${API_ENDPOINTS.ADMIN.USERS}/${userId}`);
    return response.data;
  }

  async updateUser(userId, userData) {
    const response = await apiPut(
      `${API_ENDPOINTS.ADMIN.USERS}/${userId}`,
      userData
    );
    return response.data;
  }

  async deactivateUser(userId) {
    const response = await apiPatch(
      `${API_ENDPOINTS.ADMIN.USERS}/${userId}/deactivate`
    );
    return response.data;
  }

  async deleteUser(userId) {
    const response = await apiDelete(`${API_ENDPOINTS.ADMIN.USERS}/${userId}`);
    return response.data;
  }

  // Application Management
  async getAllApplications(params = {}) {
    const response = await apiGet(API_ENDPOINTS.ADMIN.APPLICATIONS, { params });
    return response.data;
  }

  async getApplication(applicationId) {
    const response = await apiGet(
      `${API_ENDPOINTS.ADMIN.APPLICATIONS}/${applicationId}`
    );
    return response.data;
  }

  async updateApplicationStatus(applicationId, status) {
    const response = await apiPatch(
      `${API_ENDPOINTS.ADMIN.APPLICATIONS}/${applicationId}/status`,
      { status }
    );
    return response.data;
  }

  async applyToJobOnBehalf(userId, jobId) {
    const response = await apiPost(
      `${API_ENDPOINTS.ADMIN.APPLICATIONS}/apply`,
      {
        userId,
        jobId,
      }
    );
    return response.data;
  }

  // Job Management (Scraped Jobs)
  async getScrapedJobs(params = {}) {
    const response = await apiGet(API_ENDPOINTS.ADMIN.JOBS, { params });
    return response.data;
  }

  async approveJob(jobId) {
    const response = await apiPatch(
      `${API_ENDPOINTS.ADMIN.JOBS}/${jobId}/approve`
    );
    return response.data;
  }

  async rejectJob(jobId) {
    const response = await apiPatch(
      `${API_ENDPOINTS.ADMIN.JOBS}/${jobId}/reject`
    );
    return response.data;
  }

  // System Settings
  async getSystemSettings() {
    const response = await apiGet(API_ENDPOINTS.ADMIN.SYSTEM_SETTINGS);
    return response.data;
  }

  async updateSystemSettings(settings) {
    const response = await apiPut(
      API_ENDPOINTS.ADMIN.SYSTEM_SETTINGS,
      settings
    );
    return response.data;
  }
}

export default new AdminService();
