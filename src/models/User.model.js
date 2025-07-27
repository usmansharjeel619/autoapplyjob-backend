// src/models/User.model.js
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const userSchema = new mongoose.Schema(
  {
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
    userType: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    profilePicture: {
      type: String,
      default: null,
    },

    // Professional Information
    currentJobTitle: {
      type: String,
      trim: true,
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
    bio: {
      type: String,
      maxlength: [1000, "Bio cannot exceed 1000 characters"],
    },

    // Social Links
    linkedinUrl: {
      type: String,
      trim: true,
    },
    githubUrl: {
      type: String,
      trim: true,
    },
    portfolioUrl: {
      type: String,
      trim: true,
    },

    // Resume
    resume: {
      filename: String,
      originalName: String,
      url: String,
      uploadedAt: Date,
      size: Number,
    },

    // Job Preferences
    jobPreferences: {
      desiredRoles: [String],
      preferredLocations: [String],
      jobTypes: [
        {
          type: String,
          enum: [
            "full-time",
            "part-time",
            "contract",
            "freelance",
            "internship",
          ],
        },
      ],
      workTypes: [
        {
          type: String,
          enum: ["remote", "hybrid", "onsite"],
        },
      ],
      industries: [String],
      salaryRange: {
        min: Number,
        max: Number,
        currency: {
          type: String,
          default: "USD",
        },
      },
      willingToRelocate: {
        type: Boolean,
        default: false,
      },
    },

    // Package/Subscription
    package: {
      type: {
        type: String,
        enum: ["basic", "premium", "enterprise"],
        default: "basic",
      },
      features: {
        maxJobsPerMonth: {
          type: Number,
          default: 10,
        },
        aiCoverLetters: {
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
    emailVerifiedAt: Date, // Added this field
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

// Reset usage counters (call monthly)
userSchema.methods.resetMonthlyUsage = function () {
  this.usage.jobsAppliedThisMonth = 0;
  return this.save();
};

module.exports = mongoose.model("User", userSchema);
