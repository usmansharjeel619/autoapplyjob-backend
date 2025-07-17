import { apiPost, apiGet, apiPut } from "./api";
import { API_ENDPOINTS } from "../utils/constants";

class AuthService {
  async login(credentials) {
    const response = await apiPost(API_ENDPOINTS.AUTH.LOGIN, credentials);
    return response.data;
  }

  async register(userData) {
    const response = await apiPost(API_ENDPOINTS.AUTH.REGISTER, userData);
    return response.data;
  }

  async logout() {
    try {
      await apiPost(API_ENDPOINTS.AUTH.LOGOUT);
    } catch (error) {
      console.error("Logout API call failed:", error);
    }
  }

  async refreshToken(refreshToken) {
    const response = await apiPost(API_ENDPOINTS.AUTH.REFRESH, {
      refreshToken,
    });
    return response.data;
  }

  async verifyEmail(token) {
    const response = await apiPost(API_ENDPOINTS.AUTH.VERIFY_EMAIL, { token });
    return response.data;
  }

  async forgotPassword(email) {
    const response = await apiPost(API_ENDPOINTS.AUTH.FORGOT_PASSWORD, {
      email,
    });
    return response.data;
  }

  async resetPassword(token, password) {
    const response = await apiPost(API_ENDPOINTS.AUTH.RESET_PASSWORD, {
      token,
      password,
    });
    return response.data;
  }

  async changePassword(currentPassword, newPassword) {
    const response = await apiPost(API_ENDPOINTS.AUTH.CHANGE_PASSWORD, {
      currentPassword,
      newPassword,
    });
    return response.data;
  }

  async verifyToken(token) {
    try {
      const response = await apiGet(API_ENDPOINTS.AUTH.VERIFY, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
}

export default new AuthService();
