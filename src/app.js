// src/app.js (Updated with AI routes)
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const path = require("path");

const { errorHandler } = require("./middleware/error.middleware");
const logger = require("./utils/logger");

// Route imports
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const jobRoutes = require("./routes/job.routes");
const adminRoutes = require("./routes/admin.routes");
const applicationRoutes = require("./routes/application.routes");
const aiRoutes = require("./routes/ai.routes");
const paymentRoutes = require("./routes/payment.routes"); // Add this import

const app = express();

// Trust proxy (important for rate limiting behind reverse proxy)
app.set("trust proxy", 1);

// Security middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

// CORS configuration
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    error: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", limiter);

// Specific rate limiting for AI endpoints (more restrictive)
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit AI requests per IP
  message: {
    error: "Too many AI requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(
    morgan("combined", {
      stream: { write: (message) => logger.info(message.trim()) },
    })
  );
}

// Create uploads directory if it doesn't exist
const fs = require("fs");
const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    services: {
      database: "connected", // You could add actual DB health check here
      ai: process.env.OPENAI_API_KEY ? "configured" : "not_configured",
    },
  });
});

// API routes
const API_VERSION = process.env.API_VERSION || "v1";
app.use(`/api/${API_VERSION}/auth`, authRoutes);
app.use(`/api/${API_VERSION}/user`, userRoutes);
app.use(`/api/${API_VERSION}/jobs`, jobRoutes);
app.use(`/api/${API_VERSION}/admin`, adminRoutes);
app.use(`/api/${API_VERSION}/applications`, applicationRoutes);
app.use(`/api/${API_VERSION}/ai`, aiLimiter, aiRoutes); // Apply AI-specific rate limiting
app.use(`/api/${API_VERSION}/payment`, paymentRoutes); // Add payment routes

// Serve uploaded files
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// API documentation endpoint (optional)
app.get(`/api/${API_VERSION}/docs`, (req, res) => {
  res.json({
    name: "AutoApplyJob API",
    version: API_VERSION,
    endpoints: {
      auth: {
        login: "POST /auth/login",
        register: "POST /auth/register",
        logout: "POST /auth/logout",
        refresh: "POST /auth/refresh",
        verify: "GET /auth/verify",
        "forgot-password": "POST /auth/forgot-password",
        "reset-password": "POST /auth/reset-password",
      },
      user: {
        profile: "GET/PUT /user/profile",
        resume: "POST /user/resume",
        jobs: "GET /user/jobs",
        applications: "GET /user/applications",
        dashboard: "GET /user/dashboard",
        onboarding: "POST /user/onboarding",
      },
      ai: {
        "extract-text": "POST /ai/extract-text",
        "parse-resume": "POST /ai/parse-resume",
        "enhance-resume": "POST /ai/enhance-resume",
        "analyze-job-match": "POST /ai/analyze-job-match",
        status: "GET /ai/status",
      },
      jobs: {
        search: "GET /jobs/search",
        details: "GET /jobs/:id",
        apply: "POST /jobs/:id/apply",
      },
      admin: {
        dashboard: "GET /admin/dashboard",
        users: "GET /admin/users",
        applications: "GET /admin/applications",
        jobs: "GET /admin/jobs",
        analytics: "GET /admin/analytics",
      },
      payment: {
        plans: "GET /payment/plans",
        complete: "POST /payment/complete",
        status: "GET /payment/status",
        verify: "POST /payment/verify",
        cancel: "POST /payment/cancel",
      },
    },
    features: {
      ai_parsing: process.env.OPENAI_API_KEY ? "enabled" : "disabled",
      file_upload: "enabled",
      job_scraping: "enabled",
      email_notifications: "enabled",
    },
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.originalUrl,
    method: req.method,
  });
});

// Global error handler
app.use(errorHandler);

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  process.exit(0);
});

module.exports = app;
