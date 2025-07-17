const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Job title is required"],
      trim: true,
      maxlength: [200, "Job title cannot exceed 200 characters"],
    },
    company: {
      type: String,
      required: [true, "Company name is required"],
      trim: true,
    },
    location: {
      type: String,
      required: [true, "Location is required"],
      trim: true,
    },
    workType: {
      type: String,
      enum: ["remote", "hybrid", "onsite"],
      required: true,
    },
    jobType: {
      type: String,
      enum: ["full_time", "part_time", "contract", "freelance", "internship"],
      required: true,
    },
    salary: {
      min: {
        type: Number,
        min: 0,
      },
      max: {
        type: Number,
        min: 0,
      },
      currency: {
        type: String,
        default: "USD",
      },
      period: {
        type: String,
        enum: ["hourly", "monthly", "yearly"],
        default: "yearly",
      },
    },
    description: {
      type: String,
      required: [true, "Job description is required"],
    },
    requirements: [
      {
        type: String,
        trim: true,
      },
    ],
    responsibilities: [
      {
        type: String,
        trim: true,
      },
    ],
    skills: [
      {
        type: String,
        trim: true,
      },
    ],
    benefits: [
      {
        type: String,
        trim: true,
      },
    ],
    industry: {
      type: String,
      trim: true,
    },
    companySize: {
      type: String,
      enum: ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"],
    },

    // External URLs
    applyUrl: {
      type: String,
      required: true,
    },
    companyUrl: String,

    // Scraping Information
    scrapedFrom: {
      platform: {
        type: String,
        enum: [
          "linkedin",
          "indeed",
          "glassdoor",
          "monster",
          "ziprecruiter",
          "careerbuilder",
          "other",
        ],
        required: true,
      },
      originalId: String,
      scrapedAt: {
        type: Date,
        default: Date.now,
      },
    },

    // User Association
    targetUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Match Score (calculated based on user profile)
    matchScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

    // Job Status
    status: {
      type: String,
      enum: ["active", "expired", "filled", "removed"],
      default: "active",
    },

    // Admin Review Status
    adminReviewStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: Date,
    reviewNotes: String,

    // Dates
    postedDate: {
      type: Date,
      required: true,
    },
    expiryDate: Date,

    // Application Status for this job
    applicationStatus: {
      type: String,
      enum: ["not_applied", "applied", "rejected", "interview", "offer"],
      default: "not_applied",
    },
    appliedAt: Date,

    // Metadata
    isActive: {
      type: Boolean,
      default: true,
    },
    priority: {
      type: Number,
      min: 1,
      max: 5,
      default: 3,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
jobSchema.index({ targetUser: 1 });
jobSchema.index({ status: 1 });
jobSchema.index({ adminReviewStatus: 1 });
jobSchema.index({ matchScore: -1 });
jobSchema.index({ postedDate: -1 });
jobSchema.index({ "scrapedFrom.platform": 1 });
jobSchema.index({ title: "text", company: "text", description: "text" });

// Virtual for days since posted
jobSchema.virtual("daysSincePosted").get(function () {
  const today = new Date();
  const diffTime = Math.abs(today - this.postedDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for salary display
jobSchema.virtual("salaryDisplay").get(function () {
  if (!this.salary || (!this.salary.min && !this.salary.max)) {
    return "Not specified";
  }

  const currency = this.salary.currency || "USD";
  const period = this.salary.period || "yearly";

  if (this.salary.min && this.salary.max) {
    return `${currency} ${this.salary.min.toLocaleString()} - ${this.salary.max.toLocaleString()} per ${period}`;
  } else if (this.salary.min) {
    return `${currency} ${this.salary.min.toLocaleString()}+ per ${period}`;
  } else {
    return `Up to ${currency} ${this.salary.max.toLocaleString()} per ${period}`;
  }
});

// Static method to calculate match score
jobSchema.statics.calculateMatchScore = function (job, userProfile) {
  let score = 0;

  // Skills matching (40% weight)
  if (
    job.skills &&
    job.skills.length &&
    userProfile.skills &&
    userProfile.skills.length
  ) {
    const jobSkills = job.skills.map((s) => s.toLowerCase());
    const userSkills = userProfile.skills.map((s) => s.toLowerCase());
    const matchingSkills = userSkills.filter((skill) =>
      jobSkills.includes(skill)
    );
    const skillsScore = (matchingSkills.length / jobSkills.length) * 40;
    score += skillsScore;
  }

  // Location matching (20% weight)
  if (job.location && userProfile.jobPreferences?.preferredLocations?.length) {
    const isLocationMatch = userProfile.jobPreferences.preferredLocations.some(
      (loc) =>
        job.location.toLowerCase().includes(loc.toLowerCase()) ||
        loc.toLowerCase().includes(job.location.toLowerCase())
    );
    if (isLocationMatch || job.workType === "remote") score += 20;
  }

  // Job type matching (20% weight)
  if (
    job.jobType &&
    userProfile.jobPreferences?.preferredJobTypes?.includes(job.jobType)
  ) {
    score += 20;
  }

  // Work type matching (20% weight)
  if (
    job.workType &&
    userProfile.jobPreferences?.preferredWorkTypes?.includes(job.workType)
  ) {
    score += 20;
  }

  return Math.min(Math.round(score), 100);
};

// Instance method to update match score
jobSchema.methods.updateMatchScore = async function () {
  const user = await mongoose.model("User").findById(this.targetUser);
  if (user) {
    this.matchScore = this.constructor.calculateMatchScore(this, user);
    await this.save();
  }
};

module.exports = mongoose.model("Job", jobSchema);
