const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const userSchema = new mongoose.Schema(
  {
    // Basic Information
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email",
      ],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    phone: {
      type: String,
      trim: true,
    },

    // User Type
    userType: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    // Profile Information
    currentJobTitle: {
      type: String,
      trim: true,
      maxlength: [100, "Job title cannot exceed 100 characters"],
    },
    bio: {
      type: String,
      maxlength: [500, "Bio cannot exceed 500 characters"],
    },
    experienceLevel: {
      type: String,
      enum: ["0-1", "1-3", "3-5", "5-10", "10+"],
    },
    educationLevel: {
      type: String,
      enum: ["high_school", "associate", "bachelor", "master", "phd", "other"],
    },
    skills: [
      {
        type: String,
        trim: true,
      },
    ],
    location: {
      type: String,
      trim: true,
    },

    // Resume Information
    resume: {
      url: String,
      filename: String,
      uploadedAt: Date,
      parsedData: {
        skills: [String],
        experience: [
          {
            company: String,
            position: String,
            duration: String,
            description: String,
          },
        ],
        education: [
          {
            institution: String,
            degree: String,
            year: String,
          },
        ],
        summary: String,
      },
    },

    // Job Preferences
    jobPreferences: {
      desiredRoles: [String],
      preferredLocations: [String],
      salaryRange: {
        min: Number,
        max: Number,
        currency: {
          type: String,
          default: "USD",
        },
      },
      employmentType: {
        type: String,
        enum: ["full_time", "part_time", "contract", "freelance", "remote"],
        default: "full_time",
      },
      industries: [String],
      workArrangement: {
        type: String,
        enum: ["remote", "hybrid", "on_site"],
        default: "remote",
      },
    },

    // Package/Subscription Information
    package: {
      type: {
        type: String,
        enum: ["basic", "premium", "enterprise"],
        default: "basic",
      },
      startDate: Date,
      features: {
        autoApply: {
          type: Boolean,
          default: false,
        },
        prioritySupport: {
          type: Boolean,
          default: false,
        },
        advancedFilters: {
          type: Boolean,
          default: false,
        },
      },
      expiresAt: Date,
    },

    // Payment Information - NEW FIELD
    paymentCompleted: {
      type: Boolean,
      default: false,
    },
    paymentCompletedAt: {
      type: Date,
    },
    selectedPlan: {
      type: String,
      enum: ["basic", "premium", "enterprise"],
    },
    paymentHistory: [
      {
        amount: Number,
        currency: {
          type: String,
          default: "PKR",
        },
        plan: String,
        paymentMethod: String,
        transactionId: String,
        status: {
          type: String,
          enum: ["pending", "completed", "failed", "refunded"],
          default: "pending",
        },
        paidAt: Date,
      },
    ],

    // Usage Statistics
    usage: {
      jobsAppliedThisMonth: {
        type: Number,
        default: 0,
      },
      totalJobsApplied: {
        type: Number,
        default: 0,
      },
      interviewsScheduled: {
        type: Number,
        default: 0,
      },
      profileViews: {
        type: Number,
        default: 0,
      },
    },

    // Account Status
    isActive: {
      type: Boolean,
      default: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: String,
    emailVerifiedAt: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,

    // Onboarding
    onboardingCompleted: {
      type: Boolean,
      default: false,
    },
    onboardingStep: {
      type: String,
      enum: ["basic_info", "resume_upload", "job_preferences", "completed"],
      default: "basic_info",
    },

    // Timestamps
    lastLogin: Date,
    lastProfileUpdate: Date,
    lastJobScrapingRun: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ userType: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ "package.type": 1 });
userSchema.index({ paymentCompleted: 1 }); // NEW INDEX

// Virtual for profile completeness
userSchema.virtual("profileCompleteness").get(function () {
  let score = 0;

  const fields = [
    "name",
    "email",
    "phone",
    "currentJobTitle",
    "experienceLevel",
    "educationLevel",
    "location",
    "bio",
  ];

  fields.forEach((field) => {
    if (this[field] && this[field].toString().trim()) score += 10;
  });

  if (this.skills && this.skills.length > 0) score += 10;
  if (this.resume && this.resume.url) score += 10;

  return Math.min(score, 100);
});

// Pre-save middleware to hash password
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  try {
    this.password = await bcrypt.hash(this.password, 12);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate JWT token
userSchema.methods.generateAuthToken = function () {
  return jwt.sign(
    {
      id: this._id,
      email: this.email,
      userType: this.userType,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
};

// Generate refresh token
userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    {
      id: this._id,
    },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE }
  );
};

// Mark payment as completed - NEW METHOD
userSchema.methods.markPaymentCompleted = function (plan, paymentDetails = {}) {
  this.paymentCompleted = true;
  this.paymentCompletedAt = new Date();
  this.selectedPlan = plan;

  // Update package information
  this.package.type = plan;
  this.package.startDate = new Date();

  // Set package features based on plan
  switch (plan) {
    case "premium":
      this.package.features.autoApply = true;
      this.package.features.prioritySupport = true;
      this.package.features.advancedFilters = true;
      break;
    case "enterprise":
      this.package.features.autoApply = true;
      this.package.features.prioritySupport = true;
      this.package.features.advancedFilters = true;
      break;
    default: // basic
      this.package.features.autoApply = false;
      this.package.features.prioritySupport = false;
      this.package.features.advancedFilters = false;
  }

  // Add payment record
  if (paymentDetails.amount) {
    this.paymentHistory.push({
      amount: paymentDetails.amount,
      currency: paymentDetails.currency || "PKR",
      plan: plan,
      paymentMethod: paymentDetails.paymentMethod || "card",
      transactionId: paymentDetails.transactionId,
      status: "completed",
      paidAt: new Date(),
    });
  }

  return this.save();
};

// Reset usage counters (call monthly)
userSchema.methods.resetMonthlyUsage = function () {
  this.usage.jobsAppliedThisMonth = 0;
  return this.save();
};

// Static method to create admin user
userSchema.statics.createAdminUser = async function () {
  const adminExists = await this.findOne({ userType: "admin" });

  if (!adminExists) {
    const admin = new this({
      name: "Admin User",
      email: process.env.ADMIN_EMAIL || "admin@autoapplyjob.com",
      password: process.env.ADMIN_PASSWORD || "admin123456",
      userType: "admin",
      isEmailVerified: true,
      onboardingCompleted: true,
      onboardingStep: "completed",
      paymentCompleted: true,
      paymentCompletedAt: new Date(),
    });

    await admin.save();
    return admin;
  }

  return adminExists;
};

module.exports = mongoose.model("User", userSchema);
