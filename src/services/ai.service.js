// src/services/ai.service.js (Backend)
const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");
const pdf = require("pdf-parse");
const mammoth = require("mammoth");
const logger = require("../utils/logger");

class AIService {
  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.openaiApiUrl = "https://api.openai.com/v1/chat/completions";

    if (!this.openaiApiKey) {
      logger.warn("OpenAI API key not configured");
    }
  }

  // Extract text from different file types
  async extractTextFromFile(filePath, fileType) {
    try {
      let extractedText = "";

      switch (fileType) {
        case "application/pdf":
          extractedText = await this.extractTextFromPDF(filePath);
          break;
        case "application/msword":
        case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
          extractedText = await this.extractTextFromDOCX(filePath);
          break;
        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }

      return extractedText;
    } catch (error) {
      logger.error("Text extraction failed:", error);
      throw new Error("Failed to extract text from file");
    }
  }

  // Extract text from PDF
  async extractTextFromPDF(filePath) {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdf(dataBuffer);
      return data.text;
    } catch (error) {
      logger.error("PDF text extraction failed:", error);
      throw new Error("Failed to extract text from PDF");
    }
  }

  // Extract text from DOCX
  async extractTextFromDOCX(filePath) {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } catch (error) {
      logger.error("DOCX text extraction failed:", error);
      throw new Error("Failed to extract text from DOCX");
    }
  }

  // Parse resume using OpenAI
  async parseResumeWithOpenAI(resumeText) {
    if (!this.openaiApiKey) {
      throw new Error("OpenAI API key not configured");
    }

    try {
      const prompt = `
Analyze the following resume text and extract structured information in JSON format.

Extract these details:
1. Personal Information (name, email, phone, location)
2. Skills (technical skills, programming languages, tools, frameworks, soft skills)
3. Work Experience (job title, company, employment dates, description, key achievements)
4. Education (degree, institution, graduation year, GPA if mentioned)
5. Certifications (name, issuing organization, date obtained)
6. Projects (project name, description, technologies used, dates)
7. Languages (spoken languages and proficiency levels)

Resume Text:
${resumeText}

Return the extracted information in this exact JSON structure:
{
  "personalInfo": {
    "name": "",
    "email": "",
    "phone": "",
    "location": ""
  },
  "extractedSkills": ["skill1", "skill2", "skill3"],
  "workExperience": [
    {
      "title": "",
      "company": "",
      "duration": "",
      "description": "",
      "achievements": ["achievement1", "achievement2"]
    }
  ],
  "education": [
    {
      "degree": "",
      "institution": "",
      "year": "",
      "gpa": ""
    }
  ],
  "certifications": [
    {
      "name": "",
      "issuer": "",
      "date": ""
    }
  ],
  "projects": [
    {
      "name": "",
      "description": "",
      "technologies": ["tech1", "tech2"],
      "duration": ""
    }
  ],
  "languages": [
    {
      "language": "",
      "proficiency": ""
    }
  ]
}

Important: Return only the JSON object without any additional text, explanations, or markdown formatting.
`;

      const requestBody = {
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              "You are an expert resume parser. Extract information accurately and return only valid JSON. Do not include any text outside the JSON structure.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 2500,
        temperature: 0.1,
        response_format: { type: "json_object" },
      };

      logger.info("Sending request to OpenAI API for resume parsing");

      console.log("Request Body:", JSON.stringify(requestBody, null, 2));
      const response = await axios.post(this.openaiApiUrl, requestBody, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.openaiApiKey}`,
        },
        timeout: 30000, // 30 seconds timeout
      });

      const openaiResponse = response.data;

      if (!openaiResponse.choices || !openaiResponse.choices[0]) {
        throw new Error("Invalid response from OpenAI API");
      }

      const parsedContent = JSON.parse(
        openaiResponse.choices[0].message.content
      );
      return this.validateAndProcessParsedData(parsedContent);
    } catch (error) {
      logger.error("OpenAI parsing failed:", error);

      if (error.response) {
        logger.error("OpenAI API error:", error.response.data);
        throw new Error(
          `OpenAI API error: ${error.response.status} - ${error.response.data.error?.message || "Unknown error"}`
        );
      }

      throw new Error("Failed to parse resume with AI");
    }
  }

  // Validate and process parsed data
  validateAndProcessParsedData(parsedData) {
    try {
      const processedData = {
        personalInfo: {
          name: parsedData.personalInfo?.name || "",
          email: parsedData.personalInfo?.email || "",
          phone: parsedData.personalInfo?.phone || "",
          location: parsedData.personalInfo?.location || "",
        },
        extractedSkills: Array.isArray(parsedData.extractedSkills)
          ? parsedData.extractedSkills.filter(
              (skill) => skill && typeof skill === "string" && skill.trim()
            )
          : [],
        workExperience: Array.isArray(parsedData.workExperience)
          ? parsedData.workExperience.map((exp) => ({
              title: exp.title || "",
              company: exp.company || "",
              duration: exp.duration || "",
              description: exp.description || "",
              achievements: Array.isArray(exp.achievements)
                ? exp.achievements
                : [],
            }))
          : [],
        education: Array.isArray(parsedData.education)
          ? parsedData.education.map((edu) => ({
              degree: edu.degree || "",
              institution: edu.institution || "",
              year: edu.year || "",
              gpa: edu.gpa || "",
            }))
          : [],
        certifications: Array.isArray(parsedData.certifications)
          ? parsedData.certifications.map((cert) => ({
              name: cert.name || "",
              issuer: cert.issuer || "",
              date: cert.date || "",
            }))
          : [],
        projects: Array.isArray(parsedData.projects)
          ? parsedData.projects.map((proj) => ({
              name: proj.name || "",
              description: proj.description || "",
              technologies: Array.isArray(proj.technologies)
                ? proj.technologies
                : [],
              duration: proj.duration || "",
            }))
          : [],
        languages: Array.isArray(parsedData.languages)
          ? parsedData.languages.map((lang) => ({
              language: lang.language || "",
              proficiency: lang.proficiency || "",
            }))
          : [],
      };

      // Remove empty entries
      processedData.workExperience = processedData.workExperience.filter(
        (exp) => exp.title || exp.company
      );
      processedData.education = processedData.education.filter(
        (edu) => edu.degree || edu.institution
      );
      processedData.certifications = processedData.certifications.filter(
        (cert) => cert.name
      );
      processedData.projects = processedData.projects.filter(
        (proj) => proj.name
      );
      processedData.languages = processedData.languages.filter(
        (lang) => lang.language
      );
      return processedData;
    } catch (error) {
      logger.error("Error processing parsed data:", error);
      throw new Error("Failed to process parsed resume data");
    }
  }

  // Main method to parse resume file
  async parseResumeFile(filePath, fileType) {
    try {
      logger.info(`Starting resume parsing for file: ${filePath}`);

      // Step 1: Extract text from file
      const extractedText = await this.extractTextFromFile(filePath, fileType);

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error("No text could be extracted from the resume file");
      }

      logger.info(
        `Text extracted successfully, length: ${extractedText.length} characters`
      );

      // Step 2: Parse with OpenAI
      const parsedData = await this.parseResumeWithOpenAI(extractedText);

      logger.info("Resume parsing completed successfully");

      // DON'T clean up the file here - it's now saved in the database
      // await this.cleanupFile(filePath);

      return {
        extractedText: extractedText.substring(0, 1000), // First 1000 chars for debugging
        parsedData,
        metadata: {
          fileSize: (await fs.stat(filePath)).size,
          textLength: extractedText.length,
          skillsCount: parsedData.extractedSkills.length,
          experienceCount: parsedData.workExperience.length,
          educationCount: parsedData.education.length,
          fileSaved: true,
          localPath: filePath,
        },
      };
    } catch (error) {
      logger.error("Resume parsing failed:", error);
      throw error;
    }
  }

  // Generate resume improvement suggestions
  async generateResumeSuggestions(parsedData, targetJobDescription = "") {
    if (!this.openaiApiKey) {
      throw new Error("OpenAI API key not configured");
    }

    try {
      const prompt = `
As a professional resume writer, analyze the following resume data and provide improvement suggestions.

Current Resume Data:
${JSON.stringify(parsedData, null, 2)}

Target Job Description (if provided):
${targetJobDescription}

Provide suggestions for:
1. Missing skills that should be highlighted based on current experience
2. Better ways to phrase experience descriptions (more impact-oriented)
3. Additional keywords to include for ATS optimization
4. Achievements that could be better quantified
5. Overall structure improvements

Return suggestions in JSON format:
{
  "suggestedSkills": ["skill1", "skill2"],
  "improvedDescriptions": {
    "original_description": "improved_description"
  },
  "missingKeywords": ["keyword1", "keyword2"],
  "achievementSuggestions": ["suggestion1", "suggestion2"],
  "structuralSuggestions": ["suggestion1", "suggestion2"]
}
`;

      const requestBody = {
        model: "gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a professional resume writer and career coach with expertise in ATS optimization.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 1500,
        temperature: 0.3,
        response_format: { type: "json_object" },
      };

      const response = await axios.post(this.openaiApiUrl, requestBody, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.openaiApiKey}`,
        },
        timeout: 30000,
      });

      const suggestions = JSON.parse(response.data.choices[0].message.content);
      return suggestions;
    } catch (error) {
      logger.error("Resume suggestions generation failed:", error);
      throw new Error("Failed to generate resume suggestions");
    }
  }

  // Clean up uploaded files
  async cleanupFile(filePath) {
    try {
      await fs.unlink(filePath);
      logger.info(`Cleaned up file: ${filePath}`);
    } catch (error) {
      logger.warn(`Failed to cleanup file ${filePath}:`, error);
    }
  }
}

module.exports = new AIService();
