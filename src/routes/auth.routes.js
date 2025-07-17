const express = require("express");
const authController = require("../controllers/auth.controller");
const {
  authenticate,
  verifyRefreshToken,
  sensitiveOperationLimit,
} = require("../middleware/auth.middleware");
const {
  validationRules,
  handleValidationErrors,
} = require("../middleware/validation.middleware");

const router = express.Router();

// Public routes
router.post(
  "/register",
  validationRules.registerUser,
  handleValidationErrors,
  authController.register
);

router.post(
  "/login",
  sensitiveOperationLimit(5, 15 * 60 * 1000), // 5 attempts per 15 minutes
  validationRules.loginUser,
  handleValidationErrors,
  authController.login
);

router.post(
  "/forgot-password",
  sensitiveOperationLimit(3, 60 * 60 * 1000), // 3 attempts per hour
  validationRules.forgotPassword,
  handleValidationErrors,
  authController.forgotPassword
);

router.post(
  "/reset-password",
  validationRules.resetPassword,
  handleValidationErrors,
  authController.resetPassword
);

router.post("/verify-email", authController.verifyEmail);

// Token management
router.post("/refresh", verifyRefreshToken, authController.refreshToken);

router.get("/verify", authenticate, authController.verifyToken);

// Protected routes
router.post("/logout", authenticate, authController.logout);

router.post(
  "/change-password",
  authenticate,
  sensitiveOperationLimit(3, 60 * 60 * 1000),
  validationRules.changePassword,
  handleValidationErrors,
  authController.changePassword
);

router.get("/profile", authenticate, authController.getCurrentUser);

router.post(
  "/resend-verification",
  authenticate,
  sensitiveOperationLimit(3, 60 * 60 * 1000),
  authController.resendEmailVerification
);

module.exports = router;
