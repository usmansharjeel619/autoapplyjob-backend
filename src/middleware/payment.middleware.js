const { ApiResponse } = require("../utils/apiResponse");
const logger = require("../utils/logger");

/**
 * Middleware to check if user has completed payment
 * This should be used on routes that require payment completion
 */
const requirePayment = (req, res, next) => {
  try {
    // Check if user exists (should be set by authenticate middleware)
    if (!req.user) {
      return ApiResponse.unauthorized(res, "Authentication required");
    }

    // Admin users don't need payment
    if (req.user.userType === "admin") {
      return next();
    }

    // Check if payment is completed
    if (!req.user.paymentCompleted) {
      return ApiResponse.forbidden(
        res,
        "Payment required to access this feature. Please complete your payment to continue.",
        {
          redirectTo: "/payment",
          requiresPayment: true,
        }
      );
    }

    // Payment completed, proceed to next middleware
    next();
  } catch (error) {
    logger.error("Payment middleware error:", error);
    return ApiResponse.error(res, "Payment verification failed", 500);
  }
};

/**
 * Middleware to check payment for specific features
 * Used for premium features that require specific plans
 */
const requirePlan = (requiredPlan) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return ApiResponse.unauthorized(res, "Authentication required");
      }

      // Admin users have access to all features
      if (req.user.userType === "admin") {
        return next();
      }

      // Check if payment is completed
      if (!req.user.paymentCompleted) {
        return ApiResponse.forbidden(
          res,
          "Payment required to access this feature",
          {
            redirectTo: "/payment",
            requiresPayment: true,
          }
        );
      }

      // Define plan hierarchy
      const planHierarchy = {
        basic: 1,
        premium: 2,
        enterprise: 3,
      };

      const userPlanLevel = planHierarchy[req.user.selectedPlan] || 0;
      const requiredPlanLevel = planHierarchy[requiredPlan] || 1;

      if (userPlanLevel < requiredPlanLevel) {
        return ApiResponse.forbidden(
          res,
          `This feature requires ${requiredPlan} plan or higher`,
          {
            redirectTo: "/payment",
            currentPlan: req.user.selectedPlan,
            requiredPlan: requiredPlan,
          }
        );
      }

      next();
    } catch (error) {
      logger.error("Plan requirement middleware error:", error);
      return ApiResponse.error(res, "Plan verification failed", 500);
    }
  };
};

/**
 * Middleware to check if user can access dashboard
 * Combines authentication, email verification, onboarding, and payment checks
 */
const requireDashboardAccess = (req, res, next) => {
  try {
    if (!req.user) {
      return ApiResponse.unauthorized(res, "Authentication required");
    }

    // Admin users have full access
    if (req.user.userType === "admin") {
      return next();
    }

    // Check email verification
    if (!req.user.isEmailVerified) {
      return ApiResponse.forbidden(res, "Email verification required", {
        redirectTo: "/verify-email",
        requiresEmailVerification: true,
      });
    }

    // Check onboarding completion
    if (!req.user.onboardingCompleted) {
      return ApiResponse.forbidden(res, "Onboarding must be completed first", {
        redirectTo: "/onboarding",
        requiresOnboarding: true,
      });
    }

    // Check payment completion
    if (!req.user.paymentCompleted) {
      return ApiResponse.forbidden(
        res,
        "Payment required to access dashboard",
        {
          redirectTo: "/payment",
          requiresPayment: true,
        }
      );
    }

    next();
  } catch (error) {
    logger.error("Dashboard access middleware error:", error);
    return ApiResponse.error(res, "Access verification failed", 500);
  }
};

module.exports = {
  requirePayment,
  requirePlan,
  requireDashboardAccess,
};
