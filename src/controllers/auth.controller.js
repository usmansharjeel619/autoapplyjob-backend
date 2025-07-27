// src/controllers/auth.controller.js
const User = require("../models/User.model");
const { ApiResponse } = require("../utils/apiResponse");
const { asyncHandler, AppError } = require("../middleware/error.middleware");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const emailService = require("../services/email.service");
const logger = require("../utils/logger");

// Register new user
const register = asyncHandler(async (req, res) => {
  const { name, email, password, userType = "user" } = req.body;

  // Check if user already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new AppError("User with this email already exists", 400);
  }

  // Create user
  const user = new User({
    name,
    email,
    password,
    userType,
    emailVerificationToken: crypto.randomBytes(32).toString("hex"),
  });

  await user.save();

  // Generate tokens
  const token = user.generateAuthToken();
  const refreshToken = user.generateRefreshToken();

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  // Send verification email (don't wait for it)
  emailService
    .sendVerificationEmail(user.email, user.emailVerificationToken)
    .catch((err) => logger.error("Failed to send verification email:", err));

  // Remove password from response
  const userResponse = user.toObject();
  delete userResponse.password;
  delete userResponse.emailVerificationToken;

  ApiResponse.created(res, "User registered successfully", {
    user: userResponse,
    token,
    refreshToken,
  });
});

// Login user
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Check if user exists and include password for comparison
  const user = await User.findOne({ email }).select("+password");
  if (!user) {
    throw new AppError("Invalid email or password", 401);
  }

  // Check if account is active
  if (!user.isActive) {
    throw new AppError("Account is deactivated. Please contact support.", 401);
  }

  // Check password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    throw new AppError("Invalid email or password", 401);
  }

  // Generate tokens
  const token = user.generateAuthToken();
  const refreshToken = user.generateRefreshToken();

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  // Remove password from response
  const userResponse = user.toObject();
  delete userResponse.password;

  ApiResponse.success(res, "Login successful", {
    user: userResponse,
    token,
    refreshToken,
  });
});

// Logout user
const logout = asyncHandler(async (req, res) => {
  // In a more complex setup, you might want to blacklist the token
  // For now, we'll just send a success response
  ApiResponse.success(res, "Logout successful");
});

// Refresh token
const refreshToken = asyncHandler(async (req, res) => {
  const user = req.user; // Set by verifyRefreshToken middleware

  // Generate new tokens
  const token = user.generateAuthToken();
  const newRefreshToken = user.generateRefreshToken();

  // Remove password from response
  const userResponse = user.toObject();
  delete userResponse.password;

  ApiResponse.success(res, "Token refreshed successfully", {
    user: userResponse,
    token,
    refreshToken: newRefreshToken,
  });
});

// Verify email - FIXED VERSION
const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body;

  if (!token) {
    throw new AppError("Verification token is required", 400);
  }

  // Find user with the verification token
  const user = await User.findOne({ emailVerificationToken: token });
  if (!user) {
    throw new AppError("Invalid or expired verification token", 400);
  }

  // Check if email is already verified
  if (user.isEmailVerified) {
    throw new AppError("Email is already verified", 400);
  }

  // Update user verification status
  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerifiedAt = new Date();

  await user.save();

  // Remove sensitive information from response
  const userResponse = user.toObject();
  delete userResponse.password;
  delete userResponse.emailVerificationToken;

  logger.info(`Email verified successfully for user: ${user.email}`);

  ApiResponse.success(res, "Email verified successfully", {
    user: userResponse,
  });
});

// Forgot password
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    // Don't reveal if email exists or not
    return ApiResponse.success(
      res,
      "If an account with that email exists, a password reset link has been sent."
    );
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString("hex");
  user.passwordResetToken = resetToken;
  user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  await user.save();

  // Send reset email
  try {
    await emailService.sendPasswordResetEmail(user.email, resetToken);
    logger.info(`Password reset email sent to: ${user.email}`);
  } catch (error) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    logger.error("Password reset email failed:", error);
    throw new AppError("Email could not be sent", 500);
  }

  ApiResponse.success(
    res,
    "If an account with that email exists, a password reset link has been sent."
  );
});

// Reset password
const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  const user = await User.findOne({
    passwordResetToken: token,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw new AppError("Invalid or expired reset token", 400);
  }

  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  ApiResponse.success(res, "Password reset successful");
});

// Change password
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user.id).select("+password");

  const isPasswordValid = await user.comparePassword(currentPassword);
  if (!isPasswordValid) {
    throw new AppError("Current password is incorrect", 400);
  }

  user.password = newPassword;
  await user.save();

  ApiResponse.success(res, "Password changed successfully");
});

// Get current user
const getCurrentUser = asyncHandler(async (req, res) => {
  const user = req.user; // Set by authenticate middleware

  ApiResponse.success(res, "User profile retrieved successfully", { user });
});

// Verify token (for frontend token validation)
const verifyToken = asyncHandler(async (req, res) => {
  // If we reach here, token is valid (middleware handles verification)
  ApiResponse.success(res, "Token is valid", {
    user: req.user,
  });
});

// Resend email verification
const resendEmailVerification = asyncHandler(async (req, res) => {
  const user = req.user;

  if (user.isEmailVerified) {
    throw new AppError("Email is already verified", 400);
  }

  // Generate new verification token
  user.emailVerificationToken = crypto.randomBytes(32).toString("hex");
  await user.save();

  // Send verification email
  try {
    await emailService.sendVerificationEmail(
      user.email,
      user.emailVerificationToken
    );
    ApiResponse.success(res, "Verification email sent successfully");
  } catch (error) {
    logger.error("Email send error:", error);
    throw new AppError("Email could not be sent", 500);
  }
});

module.exports = {
  register,
  login,
  logout,
  refreshToken,
  verifyEmail,
  forgotPassword,
  resetPassword,
  changePassword,
  getCurrentUser,
  verifyToken,
  resendEmailVerification,
};
