const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    job: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },

    // Application Details
    status: {
      type: String,
      enum: [
        "pending_review", // Waiting for admin review
        "approved", // Admin approved for application
        "rejected", // Admin rejected
        "applied", // Actually applied to the job
        "application_sent", // Application successfully sent
        "viewed", // Employer viewed application
        "interview_requested", // Interview requested
        "interview_scheduled", // Interview scheduled
        "interview_completed", // Interview completed
        "offer_received", // Job offer received
        "offer_accepted", // Offer accepted
        "offer_rejected", // Offer rejected
        "rejected_by_employer", // Rejected by employer
        "withdrawn", // Application withdrawn
      ],
      default: "pending_review",
    },

    // Match score at time of application
    matchScore: {
      type: Number,
      min: 0,
      max: 100,
    },

    // Application method
    applicationMethod: {
      type: String,
      enum: ["manual", "auto"],
      default: "auto",
    },

    // Cover letter and notes
    coverLetter: {
      type: String,
      maxlength: [2000, "Cover letter cannot exceed 2000 characters"],
    },
    adminNotes: {
      type: String,
      maxlength: [1000, "Admin notes cannot exceed 1000 characters"],
    },
    userNotes: {
      type: String,
      maxlength: [1000, "User notes cannot exceed 1000 characters"],
    },

    // Admin review information
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: Date,

    // Application submission details
    appliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User", // Admin who applied on behalf of user
    },
    appliedAt: Date,

    // Interview details
    interview: {
      scheduledAt: Date,
      type: {
        type: String,
        enum: ["phone", "video", "in_person", "technical", "panel"],
      },
      duration: Number, // in minutes
      location: String,
      meetingLink: String,
      interviewerName: String,
      interviewerEmail: String,
      notes: String,
      feedback: String,
      completed: {
        type: Boolean,
        default: false,
      },
    },

    // Offer details
    offer: {
      salary: {
        amount: Number,
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
      benefits: [String],
      startDate: Date,
      deadline: Date, // Deadline to respond to offer
      negotiable: {
        type: Boolean,
        default: true,
      },
      additionalTerms: String,
    },

    // Timeline tracking
    timeline: [
      {
        status: {
          type: String,
          required: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
        note: String,
        updatedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],

    // Communication logs
    communications: [
      {
        type: {
          type: String,
          enum: ["email", "phone", "message", "other"],
          required: true,
        },
        direction: {
          type: String,
          enum: ["incoming", "outgoing"],
          required: true,
        },
        subject: String,
        content: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
        fromEmail: String,
        toEmail: String,
      },
    ],

    // Tracking information
    tracking: {
      emailOpened: {
        type: Boolean,
        default: false,
      },
      emailOpenedAt: Date,
      resumeViewed: {
        type: Boolean,
        default: false,
      },
      resumeViewedAt: Date,
      profileViewed: {
        type: Boolean,
        default: false,
      },
      profileViewedAt: Date,
    },

    // External tracking IDs
    externalIds: {
      companyApplicationId: String,
      atsId: String, // Applicant Tracking System ID
      emailTrackingId: String,
    },

    // Priority and flags
    priority: {
      type: Number,
      min: 1,
      max: 5,
      default: 3,
    },
    isStarred: {
      type: Boolean,
      default: false,
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
applicationSchema.index({ user: 1 });
applicationSchema.index({ job: 1 });
applicationSchema.index({ status: 1 });
applicationSchema.index({ appliedAt: -1 });
applicationSchema.index({ matchScore: -1 });
applicationSchema.index({ priority: -1 });

// Compound indexes
applicationSchema.index({ user: 1, status: 1 });
applicationSchema.index({ status: 1, appliedAt: -1 });

// Virtual for application age
applicationSchema.virtual("applicationAge").get(function () {
  const today = new Date();
  const diffTime = Math.abs(today - this.createdAt);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Pre-save middleware to add timeline entry
applicationSchema.pre("save", function (next) {
  if (this.isModified("status")) {
    this.timeline.push({
      status: this.status,
      timestamp: new Date(),
      updatedBy: this.reviewedBy || this.appliedBy,
    });
  }
  next();
});

// Static method to get application statistics
applicationSchema.statics.getStatistics = async function (userId = null) {
  const matchStage = userId
    ? { user: new mongoose.Types.ObjectId(userId) }
    : {};

  const stats = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  const result = {
    total: 0,
    pending_review: 0,
    approved: 0,
    applied: 0,
    interview_scheduled: 0,
    offer_received: 0,
    rejected: 0,
  };

  stats.forEach((stat) => {
    result[stat._id] = stat.count;
    result.total += stat.count;
  });

  return result;
};

module.exports = mongoose.model("Application", applicationSchema);
