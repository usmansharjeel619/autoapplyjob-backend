import {
  apiGet,
  apiPost,
  apiPut,
  apiPatch,
  apiDelete,
  apiPostFile,
} from "./api";
import { API_ENDPOINTS } from "../utils/constants";

class UserService {
  // Profile Management
  async getProfile() {
    const response = await apiGet(API_ENDPOINTS.USER.PROFILE);
    return response.data;
  }

  async updateProfile(profileData) {
    const response = await apiPut(
      API_ENDPOINTS.USER.UPDATE_PROFILE,
      profileData
    );
    return response.data;
  }

  async uploadResume(file, onUploadProgress = null) {
    const response = await apiPostFile(
      API_ENDPOINTS.USER.UPLOAD_RESUME,
      file,
      {},
      onUploadProgress
    );
    return response.data;
  }

  // Dashboard
  async getDashboardStats() {
    const response = await apiGet(API_ENDPOINTS.USER.DASHBOARD_STATS);
    return response.data;
  }

  // Job Management
  async getJobs(params = {}) {
    const response = await apiGet(API_ENDPOINTS.USER.GET_JOBS, { params });
    return response.data;
  }

  async getSavedJobs(params = {}) {
    const response = await apiGet(API_ENDPOINTS.USER.SAVED_JOBS, { params });
    return response.data;
  }

  async saveJob(jobId) {
    const response = await apiPost(`${API_ENDPOINTS.USER.SAVED_JOBS}/${jobId}`);
    return response.data;
  }

  async unsaveJob(jobId) {
    const response = await apiDelete(
      `${API_ENDPOINTS.USER.SAVED_JOBS}/${jobId}`
    );
    return response.data;
  }

  // Application History
  async getApplicationHistory(params = {}) {
    const response = await apiGet(API_ENDPOINTS.USER.APPLICATION_HISTORY, {
      params,
    });
    return response.data;
  }

  // Settings
  async getSettings() {
    const response = await apiGet(API_ENDPOINTS.USER.SETTINGS);
    return response.data;
  }

  async updateSettings(settings) {
    const response = await apiPut(API_ENDPOINTS.USER.SETTINGS, settings);
    return response.data;
  }

  // Onboarding
  async completeOnboardingStep(step, data) {
    const response = await apiPost(
      `${API_ENDPOINTS.USER.ONBOARDING}/${step}`,
      data
    );
    return response.data;
  }

  async getOnboardingProgress() {
    const response = await apiGet(`${API_ENDPOINTS.USER.ONBOARDING}/progress`);
    return response.data;
  }
}

export default new UserService();
