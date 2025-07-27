const jwt = require("jsonwebtoken");
const User = require("../models/User.model");
const { ApiResponse } = require("../utils/apiResponse");
const logger = require("../utils/logger");

// Verify JWT token
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return ApiResponse.unauthorized(res, "Access token is required");
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      const user = await User.findById(decoded.id).select("-password");
      if (!user) {
        return ApiResponse.unauthorized(res, "User not found");
      }

      if (!user.isActive) {
        return ApiResponse.unauthorized(res, "Account is deactivated");
      }

      req.user = user;
      next();
    } catch (tokenError) {
      if (tokenError.name === "TokenExpiredError") {
        return ApiResponse.unauthorized(res, "Token has expired");
      } else if (tokenError.name === "JsonWebTokenError") {
        return ApiResponse.unauthorized(res, "Invalid token");
      } else {
        throw tokenError;
      }
    }
  } catch (error) {
    logger.error("Authentication middleware error:", error);
    return ApiResponse.error(res, "Authentication failed", 500);
  }
};

// Check if user is admin
const requireAdmin = (req, res, next) => {
  if (req.user.userType !== "admin") {
    return ApiResponse.forbidden(res, "Admin access required");
  }
  next();
};

// Optional authentication - doesn't fail if no token provided
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return next();
    }

    const token = authHeader.substring(7);

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("-password");

      if (user && user.isActive) {
        req.user = user;
      }
    } catch (tokenError) {
      // Silently ignore token errors for optional auth
    }

    next();
  } catch (error) {
    // Silently ignore errors for optional auth
    next();
  }
};

// Verify refresh token
const verifyRefreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return ApiResponse.badRequest(res, "Refresh token is required");
    }

    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

      const user = await User.findById(decoded.userId);
      if (!user || !user.isActive) {
        return ApiResponse.unauthorized(res, "Invalid refresh token");
      }

      req.user = user;
      next();
    } catch (tokenError) {
      return ApiResponse.unauthorized(res, "Invalid or expired refresh token");
    }
  } catch (error) {
    logger.error("Refresh token verification error:", error);
    return ApiResponse.error(res, "Token verification failed", 500);
  }
};

// Rate limiting for sensitive operations
const sensitiveOperationLimit = (
  maxAttempts = 5,
  windowMs = 15 * 60 * 1000
) => {
  const attempts = new Map();

  return (req, res, next) => {
    const key = req.ip + (req.user ? req.user._id : "");
    const now = Date.now();

    // Clean old entries
    for (const [k, v] of attempts.entries()) {
      if (now - v.lastAttempt > windowMs) {
        attempts.delete(k);
      }
    }

    const userAttempts = attempts.get(key) || { count: 0, lastAttempt: now };

    if (userAttempts.count >= maxAttempts) {
      return ApiResponse.rateLimited(
        res,
        "Too many attempts. Please try again later."
      );
    }

    userAttempts.count++;
    userAttempts.lastAttempt = now;
    attempts.set(key, userAttempts);

    next();
  };
};

module.exports = {
  authenticate,
  requireAdmin,
  optionalAuth,
  verifyRefreshToken,
  sensitiveOperationLimit,
};
