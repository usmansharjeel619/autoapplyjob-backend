const express = require("express");
const { body } = require("express-validator");
const paymentController = require("../controllers/payment.controller");
const { authenticate, optionalAuth } = require("../middleware/auth.middleware");
const {
  validationRules,
  handleValidationErrors,
} = require("../middleware/validation.middleware");

const router = express.Router();

// Public routes
router.get("/plans", paymentController.getPlans);

// Protected routes - require authentication
router.use(authenticate);

// Complete payment
router.post(
  "/complete",
  [
    // Validation rules for payment completion
    body("plan")
      .isIn(["basic", "premium", "enterprise"])
      .withMessage("Invalid plan selected"),
    body("amount")
      .isNumeric()
      .withMessage("Amount must be a number")
      .isFloat({ min: 0 })
      .withMessage("Amount must be positive"),
    body("currency")
      .optional()
      .isIn(["PKR", "USD"])
      .withMessage("Invalid currency"),
    body("paymentMethod")
      .optional()
      .isIn(["card", "bank", "easypaisa", "jazzcash"])
      .withMessage("Invalid payment method"),
  ],
  handleValidationErrors,
  paymentController.completePayment
);

// Get payment status
router.get("/status", paymentController.getPaymentStatus);

// Verify payment transaction
router.post(
  "/verify",
  [
    body("transactionId").notEmpty().withMessage("Transaction ID is required"),
    body("paymentGateway")
      .optional()
      .isIn(["stripe", "paypal", "razorpay", "easypaisa", "jazzcash"])
      .withMessage("Invalid payment gateway"),
  ],
  handleValidationErrors,
  paymentController.verifyPayment
);

// Cancel payment
router.post(
  "/cancel",
  [
    body("reason")
      .optional()
      .isLength({ max: 500 })
      .withMessage("Reason cannot exceed 500 characters"),
  ],
  handleValidationErrors,
  paymentController.cancelPayment
);

module.exports = router;
