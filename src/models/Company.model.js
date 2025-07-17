const mongoose = require("mongoose");

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Company name is required"],
      trim: true,
      unique: true,
    },
    domain: {
      type: String,
      trim: true,
      lowercase: true,
    },
    website: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },
    industry: {
      type: String,
      trim: true,
    },
    size: {
      type: String,
      enum: ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"],
    },
    location: {
      headquarters: String,
      offices: [String],
    },
    logo: {
      type: String,
    },
    socialLinks: {
      linkedin: String,
      twitter: String,
      facebook: String,
      instagram: String,
    },

    // Company ratings and reviews
    ratings: {
      overall: {
        type: Number,
        min: 0,
        max: 5,
        default: 0,
      },
      culture: {
        type: Number,
        min: 0,
        max: 5,
        default: 0,
      },
      compensation: {
        type: Number,
        min: 0,
        max: 5,
        default: 0,
      },
      workLifeBalance: {
        type: Number,
        min: 0,
        max: 5,
        default: 0,
      },
      reviewCount: {
        type: Number,
        default: 0,
      },
    },

    // Application tracking
    applicationStats: {
      totalApplications: {
        type: Number,
        default: 0,
      },
      successfulApplications: {
        type: Number,
        default: 0,
      },
      averageResponseTime: {
        type: Number, // in days
        default: 0,
      },
      responseRate: {
        type: Number, // percentage
        default: 0,
      },
    },

    // Contact information
    contacts: [
      {
        name: String,
        email: String,
        role: String,
        department: String,
      },
    ],

    // Company status
    isActive: {
      type: Boolean,
      default: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },

    // Metadata
    tags: [String],
    notes: String,
  },
  {
    timestamps: true,
  }
);

// Indexes
companySchema.index({ name: 1 });
companySchema.index({ domain: 1 });
companySchema.index({ industry: 1 });
companySchema.index({ "ratings.overall": -1 });

module.exports = mongoose.model("Company", companySchema);
