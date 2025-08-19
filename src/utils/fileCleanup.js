const fs = require("fs").promises;
const path = require("path");
const User = require("../models/User.model");
const logger = require("./logger");

class FileCleanupService {
  // Clean up orphaned files (files that exist but aren't referenced in DB)
  async cleanupOrphanedFiles() {
    try {
      const uploadsDir = path.join(__dirname, "../uploads/resumes");
      const files = await fs.readdir(uploadsDir);

      // Get all resume paths from database
      const users = await User.find({
        "resume.localPath": { $exists: true },
      }).select("resume.localPath");

      const dbFilePaths = users.map((user) => user.resume.localPath);

      // Check each file in uploads directory
      for (const file of files) {
        const fullPath = path.join(uploadsDir, file);
        const isReferenced = dbFilePaths.some((dbPath) =>
          dbPath.includes(file)
        );

        if (!isReferenced) {
          await fs.unlink(fullPath);
          logger.info(`Cleaned up orphaned file: ${file}`);
        }
      }
    } catch (error) {
      logger.error("File cleanup failed:", error);
    }
  }

  // Clean up old files (older than X days)
  async cleanupOldFiles(daysOld = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const usersWithOldResumes = await User.find({
        "resume.uploadedAt": { $lt: cutoffDate },
        "resume.localPath": { $exists: true },
      });

      for (const user of usersWithOldResumes) {
        try {
          await fs.unlink(user.resume.localPath);
          user.resume.localPath = undefined;
          await user.save();
          logger.info(`Cleaned up old resume for user: ${user._id}`);
        } catch (fileError) {
          logger.warn(
            `Failed to cleanup file for user ${user._id}:`,
            fileError
          );
        }
      }
    } catch (error) {
      logger.error("Old file cleanup failed:", error);
    }
  }
}

module.exports = new FileCleanupService();
