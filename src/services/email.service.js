const nodemailer = require("nodemailer");
const logger = require("../utils/logger");

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    this.fromEmail = process.env.FROM_EMAIL || "noreply@autoapplyjob.com";
    this.fromName = process.env.FROM_NAME || "AutoApplyJob";
  }

  // Send verification email
  async sendVerificationEmail(email, token) {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?token=${token}`;

    const mailOptions = {
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to: email,
      subject: "Verify Your Email Address",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">Welcome to AutoApplyJob!</h1>
          <p>Thank you for signing up. Please verify your email address by clicking the button below:</p>
          <a href="${verificationUrl}" 
             style="display: inline-block; background-color: #007bff; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 4px; margin: 20px 0;">
            Verify Email Address
          </a>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p><a href="${verificationUrl}">${verificationUrl}</a></p>
          <p>This link will expire in 24 hours.</p>
          <hr style="margin: 30px 0;">
          <p style="color: #666; font-size: 12px;">
            If you didn't create an account with AutoApplyJob, you can safely ignore this email.
          </p>
        </div>
      `,
    };

    return await this.sendEmail(mailOptions);
  }

  // Send password reset email
  async sendPasswordResetEmail(email, token) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

    const mailOptions = {
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to: email,
      subject: "Password Reset Request",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">Password Reset Request</h1>
          <p>You requested a password reset for your AutoApplyJob account.</p>
          <p>Click the button below to reset your password:</p>
          <a href="${resetUrl}" 
             style="display: inline-block; background-color: #dc3545; color: white; padding: 12px 24px; 
                    text-decoration: none; border-radius: 4px; margin: 20px 0;">
            Reset Password
          </a>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p><strong>This link will expire in 10 minutes.</strong></p>
          <hr style="margin: 30px 0;">
          <p style="color: #666; font-size: 12px;">
            If you didn't request a password reset, you can safely ignore this email.
          </p>
        </div>
      `,
    };

    return await this.sendEmail(mailOptions);
  }

  // Send application status update email
  async sendApplicationStatusEmail(email, applicationData) {
    const { jobTitle, company, status, userName } = applicationData;

    const statusMessages = {
      applied: "Your application has been submitted successfully!",
      interview_scheduled: "Great news! An interview has been scheduled.",
      offer_received: "Congratulations! You have received a job offer.",
      rejected_by_employer: "Unfortunately, your application was not selected.",
      withdrawn: "Your application has been withdrawn.",
    };

    const mailOptions = {
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to: email,
      subject: `Application Update: ${jobTitle} at ${company}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">Application Status Update</h1>
          <p>Hi ${userName},</p>
          <p>${statusMessages[status]}</p>
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 4px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0;">Job Details:</h3>
            <p><strong>Position:</strong> ${jobTitle}</p>
            <p><strong>Company:</strong> ${company}</p>
            <p><strong>Status:</strong> ${status
              .replace("_", " ")
              .toUpperCase()}</p>
          </div>
          <p>
            <a href="${process.env.FRONTEND_URL}/dashboard" 
               style="display: inline-block; background-color: #007bff; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 4px;">
              View Dashboard
            </a>
          </p>
          <hr style="margin: 30px 0;">
          <p style="color: #666; font-size: 12px;">
            Best regards,<br>
            The AutoApplyJob Team
          </p>
        </div>
      `,
    };

    return await this.sendEmail(mailOptions);
  }

  // Send daily digest email
  async sendDailyDigest(email, digestData) {
    const { userName, newJobs, applications, interviews } = digestData;

    const mailOptions = {
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to: email,
      subject: "Your Daily Job Search Digest",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">Daily Digest</h1>
          <p>Hi ${userName},</p>
          <p>Here's your daily job search summary:</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 4px; margin: 20px 0;">
            <h3 style="margin: 0 0 15px 0;">Today's Summary</h3>
            <p>📋 <strong>New Jobs Found:</strong> ${newJobs}</p>
            <p>📤 <strong>Applications Submitted:</strong> ${applications}</p>
            <p>🗣️ <strong>Interviews Scheduled:</strong> ${interviews}</p>
          </div>
          
          <p>
            <a href="${process.env.FRONTEND_URL}/dashboard" 
               style="display: inline-block; background-color: #007bff; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 4px;">
              View Full Dashboard
            </a>
          </p>
          
          <hr style="margin: 30px 0;">
          <p style="color: #666; font-size: 12px;">
            To unsubscribe from daily digests, please update your preferences in your account settings.
          </p>
        </div>
      `,
    };

    return await this.sendEmail(mailOptions);
  }

  // Send welcome email
  async sendWelcomeEmail(email, userName) {
    const mailOptions = {
      from: `"${this.fromName}" <${this.fromEmail}>`,
      to: email,
      subject: "Welcome to AutoApplyJob!",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #333;">Welcome to AutoApplyJob, ${userName}!</h1>
          <p>We're excited to help you accelerate your job search with our automated application system.</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 4px; margin: 20px 0;">
                <h3 style="margin: 0 0 15px 0;">Next Steps:</h3>
            <ol style="margin: 0; padding-left: 20px;">
              <li style="margin: 5px 0;">Complete your profile setup</li>
              <li style="margin: 5px 0;">Upload your resume</li>
              <li style="margin: 5px 0;">Set your job preferences</li>
              <li style="margin: 5px 0;">Let our system find perfect matches for you!</li>
            </ol>
          </div>
          
          <p>
            <a href="${process.env.FRONTEND_URL}/onboarding" 
               style="display: inline-block; background-color: #28a745; color: white; padding: 12px 24px; 
                      text-decoration: none; border-radius: 4px;">
              Complete Setup
            </a>
          </p>
          
          <hr style="margin: 30px 0;">
          <p style="color: #666; font-size: 12px;">
            Need help? Contact our support team or visit our help center.
          </p>
        </div>
      `,
    };

    return await this.sendEmail(mailOptions);
  }

  // Generic email sender
  async sendEmail(mailOptions) {
    try {
      const result = await this.transporter.sendMail(mailOptions);
      logger.info(
        `Email sent successfully to ${mailOptions.to}: ${result.messageId}`
      );
      return result;
    } catch (error) {
      logger.error(`Failed to send email to ${mailOptions.to}:`, error);
      throw new Error(`Email sending failed: ${error.message}`);
    }
  }

  // Test email configuration
  async testEmailConfig() {
    try {
      await this.transporter.verify();
      logger.info("Email configuration is valid");
      return true;
    } catch (error) {
      logger.error("Email configuration error:", error);
      return false;
    }
  }
}

module.exports = new EmailService();
