// src/routes/ai.routes.js
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const { authenticate } = require("../middleware/auth.middleware");
const { asyncHandler, AppError } = require("../middleware/error.middleware");
const aiService = require("../services/ai.service");
const logger = require("../utils/logger");

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), "uploads", "resumes");

    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname);
    cb(null, `resume-${uniqueSuffix}${extension}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError("Only PDF, DOC, and DOCX files are allowed", 400), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB
  },
});

// Apply authentication to all routes
router.use(authenticate);

/**
 * @route   POST /api/v1/ai/extract-text
 * @desc    Extract text from uploaded file
 * @access  Private
 */
router.post(
  "/extract-text",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    let filePath = null;

    try {
      if (!req.file) {
        throw new AppError("No file uploaded", 400);
      }

      filePath = req.file.path;
      const extractedText = await aiService.extractTextFromFile(
        filePath,
        req.file.mimetype
      );

      // Clean up the uploaded file
      // await aiService.cleanupFile(filePath);

      res.status(200).json({
        success: true,
        data: {
          text: extractedText,
          metadata: {
            filename: req.file.originalname,
            fileSize: req.file.size,
            textLength: extractedText.length,
          },
        },
      });
    } catch (error) {
      logger.error("Text extraction failed:", error);

      // Clean up file on error
      if (filePath) {
        await aiService.cleanupFile(filePath).catch(() => {});
      }

      throw error;
    }
  })
);

/**
 * @route   POST /api/v1/ai/parse-resume
 * @desc    Parse resume using AI and save to user profile
 * @access  Private
 */
router.post(
  "/parse-resume",
  upload.single("resume"),
  asyncHandler(async (req, res) => {
    let filePath = null;

    try {
      if (!req.file) {
        throw new AppError("No resume file uploaded", 400);
      }

      filePath = req.file.path;
      const userId = req.user.id;

      logger.info(
        `Processing resume upload for user ${userId}: ${req.file.originalname}`
      );

      // Parse the resume using AI service
      const result = await aiService.parseResumeFile(
        filePath,
        req.file.mimetype
      );

      // Update user with resume information
      const User = require("../models/User.model");
      const user = await User.findById(userId);

      if (!user) {
        throw new AppError("User not found", 404);
      }

      // Prepare resume data to save
      const resumeData = {
        localPath: filePath, // Save the local file path
        filename: req.file.filename, // Generated filename
        originalName: req.file.originalname, // Original filename from user
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        uploadedAt: new Date(),
        parsedAt: new Date(),
        parseStatus: "success",
        parsedData: {
          skills: result.parsedData.extractedSkills || [],
          experience: result.parsedData.workExperience || [],
          education: result.parsedData.education || [],
          certifications: result.parsedData.certifications || [],
          projects: result.parsedData.projects || [],
          languages: result.parsedData.languages || [],
          personalInfo: result.parsedData.personalInfo || {},
          summary: result.extractedText || "",
        },
      };

      // Update user's resume field
      user.resume = resumeData;

      // Also update user's skills from parsed data
      if (
        result.parsedData.extractedSkills &&
        result.parsedData.extractedSkills.length > 0
      ) {
        user.skills = [
          ...new Set([...user.skills, ...result.parsedData.extractedSkills]),
        ];
      }

      // Update personal info if not already set
      if (result.parsedData.personalInfo) {
        const personalInfo = result.parsedData.personalInfo;
        if (personalInfo.name && !user.name) {
          user.name = personalInfo.name;
        }
        if (personalInfo.phone && !user.phone) {
          user.phone = personalInfo.phone;
        }
        if (personalInfo.location && !user.location) {
          user.location = personalInfo.location;
        }
      }

      await user.save();

      logger.info(`Resume saved successfully for user ${userId}`);

      res.status(200).json({
        success: true,
        data: {
          parsedData: result.parsedData,
          resumeInfo: {
            filename: req.file.filename,
            originalName: req.file.originalname,
            fileSize: req.file.size,
            uploadedAt: resumeData.uploadedAt,
            parsedAt: resumeData.parsedAt,
            parseStatus: "success",
          },
          metadata: {
            ...result.metadata,
            fileSaved: true,
            localPath: filePath, // Include for debugging (remove in production)
          },
        },
        message: "Resume parsed and saved successfully",
      });
    } catch (error) {
      logger.error("Resume parsing failed:", error);

      // Update user with failed parse status if user exists
      try {
        if (req.user && req.file) {
          const User = require("../models/User.model");
          const user = await User.findById(req.user.id);
          if (user) {
            user.resume = {
              ...user.resume,
              localPath: filePath,
              filename: req.file.filename,
              originalName: req.file.originalname,
              fileSize: req.file.size,
              mimeType: req.file.mimetype,
              uploadedAt: new Date(),
              parseStatus: "failed",
            };
            await user.save();
          }
        }
      } catch (saveError) {
        logger.error(
          "Failed to save resume info after parse error:",
          saveError
        );
      }

      // Clean up file on error (optional - you might want to keep it for retry)
      if (filePath) {
        await aiService.cleanupFile(filePath).catch(() => {});
      }

      let statusCode = 500;
      let message = "Failed to parse resume";

      if (error.message.includes("OpenAI API")) {
        statusCode = 503;
        message = "AI service temporarily unavailable";
      } else if (error.message.includes("No text could be extracted")) {
        statusCode = 400;
        message = "Unable to extract text from the uploaded file";
      } else if (error.message.includes("API key not configured")) {
        statusCode = 503;
        message = "AI service not configured";
      }

      throw new AppError(message, statusCode);
    }
  })
);

/**
 * @route   POST /api/v1/ai/enhance-resume
 * @desc    Get AI suggestions for resume improvement
 * @access  Private
 */
router.post(
  "/enhance-resume",
  asyncHandler(async (req, res) => {
    const { resumeData, targetJobDescription } = req.body;

    if (!resumeData) {
      throw new AppError("Resume data is required", 400);
    }

    logger.info(`Generating resume suggestions for user ${req.user.id}`);

    const suggestions = await aiService.generateResumeSuggestions(
      resumeData,
      targetJobDescription || ""
    );

    res.status(200).json({
      success: true,
      data: {
        suggestions,
        generatedAt: new Date().toISOString(),
      },
      message: "Resume suggestions generated successfully",
    });
  })
);

/**
 * @route   POST /api/v1/ai/analyze-job-match
 * @desc    Analyze how well a resume matches a job description
 * @access  Private
 */
router.post(
  "/analyze-job-match",
  asyncHandler(async (req, res) => {
    try {
      const { resumeData, jobDescription } = req.body;

      if (!resumeData || !jobDescription) {
        throw new AppError(
          "Both resume data and job description are required",
          400
        );
      }

      logger.info(`Analyzing job match for user ${req.user.id}`);

      const prompt = `
Analyze how well this resume matches the given job description. Provide a detailed analysis.

Resume Data:
${JSON.stringify(resumeData, null, 2)}

Job Description:
${jobDescription}

Provide analysis in JSON format:
{
  "matchScore": 85,
  "matchingSkills": ["skill1", "skill2"],
  "missingSkills": ["skill1", "skill2"],
  "experienceMatch": {
    "score": 80,
    "analysis": "description of experience alignment"
  },
  "improvementSuggestions": ["suggestion1", "suggestion2"],
  "keywordOptimization": ["keyword1", "keyword2"],
  "overallFeedback": "detailed feedback about the match"
}
`;

      const requestBody = {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "You are an expert recruiter and resume analyst. Provide detailed, actionable feedback.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 2000,
        temperature: 0.2,
        response_format: { type: "json_object" },
      };

      const axios = require("axios");
      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        requestBody,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          },
          timeout: 30000,
        }
      );

      const analysis = JSON.parse(response.data.choices[0].message.content);

      res.status(200).json({
        success: true,
        data: {
          analysis,
          analyzedAt: new Date().toISOString(),
        },
        message: "Job match analysis completed successfully",
      });
    } catch (error) {
      logger.error("Job match analysis failed:", error);

      res.status(500).json({
        success: false,
        message: "Failed to analyze job match",
        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  })
);

/**
 * @route   GET /api/v1/ai/status
 * @desc    Check AI service status
 * @access  Private
 */
router.get(
  "/status",
  asyncHandler(async (req, res) => {
    const hasApiKey = !!process.env.OPENAI_API_KEY;

    let apiStatus = "not_configured";
    if (hasApiKey) {
      try {
        // Test API with a simple request
        const axios = require("axios");
        await axios.post(
          "https://api.openai.com/v1/chat/completions",
          {
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: "test" }],
            max_tokens: 1,
          },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            timeout: 10000,
          }
        );
        apiStatus = "operational";
      } catch (error) {
        if (error.response?.status === 401) {
          apiStatus = "invalid_key";
        } else {
          apiStatus = "error";
        }
      }
    }

    res.status(200).json({
      success: true,
      data: {
        configured: hasApiKey,
        status: apiStatus,
        supportedFormats: ["PDF", "DOC", "DOCX"],
        maxFileSize: process.env.MAX_FILE_SIZE || "5MB",
        checkedAt: new Date().toISOString(),
      },
    });
  })
);

// Error handling middleware for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File too large. Maximum size is 5MB.",
      });
    }
    return res.status(400).json({
      success: false,
      message: "File upload error: " + error.message,
    });
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  next(error);
});

module.exports = router;
