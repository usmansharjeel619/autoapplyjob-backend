const { asyncHandler, AppError } = require("../middleware/error.middleware");
const { ApiResponse } = require("../utils/apiResponse");
const User = require("../models/User.model");
const logger = require("../utils/logger");

/**
 * @desc    Complete payment and update user
 * @route   POST /api/payment/complete
 * @access  Private
 */
const completePayment = asyncHandler(async (req, res) => {
  const { plan, amount, currency, paymentMethod, cardDetails, transactionId } =
    req.body;
  const userId = req.user._id;

  // Validate required fields
  if (!plan || !amount) {
    throw new AppError("Plan and amount are required", 400);
  }

  // Validate plan
  const validPlans = ["basic", "premium", "enterprise"];
  if (!validPlans.includes(plan)) {
    throw new AppError("Invalid plan selected", 400);
  }

  try {
    // Find user
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Check if user already has payment completed
    if (user.paymentCompleted) {
      return ApiResponse.success(res, "Payment already completed", {
        paymentCompleted: true,
        selectedPlan: user.selectedPlan,
      });
    }

    // In a real implementation, you would:
    // 1. Verify payment with payment gateway
    // 2. Check transaction status
    // 3. Validate payment amount matches plan price

    // For now, we'll simulate successful payment processing
    const paymentDetails = {
      amount,
      currency: currency || "PKR",
      paymentMethod: paymentMethod || "card",
      transactionId:
        transactionId ||
        `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    };

    // Mark payment as completed
    await user.markPaymentCompleted(plan, paymentDetails);

    // Log successful payment
    logger.info(`Payment completed for user ${userId}`, {
      userId,
      plan,
      amount,
      transactionId: paymentDetails.transactionId,
    });

    // Return success response
    ApiResponse.success(res, "Payment completed successfully", {
      paymentCompleted: true,
      selectedPlan: plan,
      packageFeatures: user.package.features,
      paymentDetails: {
        amount,
        currency: currency || "PKR",
        plan,
        completedAt: user.paymentCompletedAt,
      },
    });
  } catch (error) {
    logger.error("Payment completion failed:", error);
    throw new AppError("Payment processing failed", 500);
  }
});

/**
 * @desc    Get payment status
 * @route   GET /api/payment/status
 * @access  Private
 */
const getPaymentStatus = asyncHandler(async (req, res) => {
  const user = req.user;

  ApiResponse.success(res, "Payment status retrieved", {
    paymentCompleted: user.paymentCompleted,
    selectedPlan: user.selectedPlan,
    paymentCompletedAt: user.paymentCompletedAt,
    packageFeatures: user.package.features,
    paymentHistory: user.paymentHistory,
  });
});

/**
 * @desc    Get available plans
 * @route   GET /api/payment/plans
 * @access  Public
 */
const getPlans = asyncHandler(async (req, res) => {
  const plans = [
    {
      id: "basic",
      name: "Basic Plan",
      price: 2999,
      currency: "PKR",
      period: "month",
      features: [
        "Up to 50 job applications per month",
        "Basic job matching",
        "Email notifications",
        "Resume upload",
        "Standard support",
      ],
      recommended: false,
    },
    {
      id: "premium",
      name: "Premium Plan",
      price: 4999,
      currency: "PKR",
      period: "month",
      features: [
        "Unlimited job applications",
        "AI-powered job matching",
        "Auto-apply feature",
        "Priority support",
        "Advanced filters",
        "Interview preparation tips",
        "Salary insights",
      ],
      recommended: true,
    },
    {
      id: "enterprise",
      name: "Enterprise Plan",
      price: 9999,
      currency: "PKR",
      period: "month",
      features: [
        "Everything in Premium",
        "Dedicated account manager",
        "Custom integrations",
        "Advanced analytics",
        "Team collaboration features",
        "Priority job placement",
        "24/7 phone support",
      ],
      recommended: false,
    },
  ];

  ApiResponse.success(res, "Plans retrieved successfully", { plans });
});

/**
 * @desc    Verify payment transaction
 * @route   POST /api/payment/verify
 * @access  Private
 */
const verifyPayment = asyncHandler(async (req, res) => {
  const { transactionId, paymentGateway } = req.body;
  const userId = req.user._id;

  if (!transactionId) {
    throw new AppError("Transaction ID is required", 400);
  }

  try {
    // In a real implementation, you would verify with the actual payment gateway
    // For example, with Stripe, PayPal, Razorpay, etc.

    // Simulate payment verification
    const verificationResult = {
      success: true,
      transactionId,
      status: "completed",
      amount: 4999, // This would come from payment gateway
      currency: "PKR",
    };

    if (!verificationResult.success) {
      throw new AppError("Payment verification failed", 400);
    }

    // Find user and update payment status
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    // Update payment history with verified transaction
    const paymentRecord = user.paymentHistory.find(
      (payment) => payment.transactionId === transactionId
    );

    if (paymentRecord) {
      paymentRecord.status = "completed";
      await user.save();
    }

    logger.info(`Payment verified for user ${userId}`, {
      userId,
      transactionId,
      amount: verificationResult.amount,
    });

    ApiResponse.success(res, "Payment verified successfully", {
      verified: true,
      transactionId,
      status: verificationResult.status,
    });
  } catch (error) {
    logger.error("Payment verification failed:", error);
    throw new AppError("Payment verification failed", 500);
  }
});

/**
 * @desc    Cancel/refund payment
 * @route   POST /api/payment/cancel
 * @access  Private
 */
const cancelPayment = asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const userId = req.user._id;

  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    if (!user.paymentCompleted) {
      throw new AppError("No active payment to cancel", 400);
    }

    // In a real implementation, you would:
    // 1. Process refund with payment gateway
    // 2. Update payment status to refunded
    // 3. Downgrade user features

    // Reset payment status
    user.paymentCompleted = false;
    user.paymentCompletedAt = null;
    user.selectedPlan = null;
    user.package.type = "basic";
    user.package.features = {
      autoApply: false,
      prioritySupport: false,
      advancedFilters: false,
    };

    // Add cancellation record to payment history
    user.paymentHistory.push({
      amount: 0,
      currency: "PKR",
      plan: "cancelled",
      paymentMethod: "refund",
      status: "refunded",
      paidAt: new Date(),
    });

    await user.save();

    logger.info(`Payment cancelled for user ${userId}`, {
      userId,
      reason,
    });

    ApiResponse.success(res, "Payment cancelled successfully", {
      paymentCompleted: false,
      refundProcessed: true,
    });
  } catch (error) {
    logger.error("Payment cancellation failed:", error);
    throw new AppError("Payment cancellation failed", 500);
  }
});

module.exports = {
  completePayment,
  getPaymentStatus,
  getPlans,
  verifyPayment,
  cancelPayment,
};
