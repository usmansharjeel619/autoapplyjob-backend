const mongoose = require("mongoose");
const User = require("../models/User.model");
const connectDB = require("../config/database");
const logger = require("../utils/logger");

const seedDatabase = async () => {
  try {
    await connectDB();

    logger.info("Starting database seeding...");

    // Create admin user
    await User.createAdminUser();
    logger.info("Admin user created/verified");

    // Create sample users if needed
    const userCount = await User.countDocuments({ userType: "user" });
    if (userCount === 0) {
      const sampleUsers = [
        {
          name: "John Doe",
          email: "john.doe@example.com",
          password: "password123",
          currentJobTitle: "Software Engineer",
          experienceLevel: "3-5",
          educationLevel: "bachelor",
          skills: ["JavaScript", "React", "Node.js"],
          location: "San Francisco, CA",
          isEmailVerified: true,
          onboardingCompleted: true,
          onboardingStep: "completed",
        },
        {
          name: "Jane Smith",
          email: "jane.smith@example.com",
          password: "password123",
          currentJobTitle: "Product Manager",
          experienceLevel: "5-10",
          educationLevel: "master",
          skills: ["Product Strategy", "Agile", "Analytics"],
          location: "New York, NY",
          isEmailVerified: true,
          onboardingCompleted: true,
          onboardingStep: "completed",
        },
      ];

      await User.insertMany(sampleUsers);
      logger.info(`Created ${sampleUsers.length} sample users`);
    }

    logger.info("Database seeding completed successfully");
    process.exit(0);
  } catch (error) {
    logger.error("Database seeding failed:", error);
    process.exit(1);
  }
};

// Run seeding if this file is executed directly
if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
