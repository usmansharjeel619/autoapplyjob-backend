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

// Verify email
const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body;

  const user = await User.findOne({ emailVerificationToken: token });
  if (!user) {
    throw new AppError("Invalid or expired verification token", 400);
  }

  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  await user.save();

  ApiResponse.success(res, "Email verified successfully");
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
  user.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

  await user.save();

  // Send reset email
  try {
    await emailService.sendPasswordResetEmail(user.email, resetToken);
    ApiResponse.success(res, "Password reset link sent to your email");
  } catch (error) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    logger.error("Email send error:", error);
    throw new AppError("Email could not be sent", 500);
  }
});

// Reset password
const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;

  // Hash the token to compare with stored hash
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw new AppError("Token is invalid or has expired", 400);
  }

  // Set new password
  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  // Generate new auth token
  const authToken = user.generateAuthToken();

  ApiResponse.success(res, "Password reset successful", {
    token: authToken,
  });
});

// Change password (for logged-in users)
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user._id;

  // Get user with password
  const user = await User.findById(userId).select("+password");
  if (!user) {
    throw new AppError("User not found", 404);
  }

  // Check current password
  const isCurrentPasswordValid = await user.comparePassword(currentPassword);
  if (!isCurrentPasswordValid) {
    throw new AppError("Current password is incorrect", 400);
  }

  // Update password
  user.password = newPassword;
  await user.save();

  ApiResponse.success(res, "Password changed successfully");
});

// Get current user profile
const getCurrentUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select(
    "-password -emailVerificationToken -passwordResetToken"
  );

  if (!user) {
    throw new AppError("User not found", 404);
  }

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
