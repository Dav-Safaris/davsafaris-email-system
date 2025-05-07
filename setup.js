// setup.js
const sequelize = require("./src/config/database");
const EmailTemplate = require("./src/models/EmailTemplate");
const logger = require("./src/utils/logger");
require("dotenv").config();

// Sample HTML template
const sampleTemplate = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Welcome Email</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; padding: 20px 0; background-color: #f8f9fa;">
            <h1>Welcome to Our Service!</h1>
        </div>
        <div style="padding: 20px 0;">
            <p>Hello {{name}},</p>
            <p>Thank you for signing up! We're excited to have you onboard.</p>
            <p>Here are your account details:</p>
            <ul>
                <li><strong>Username:</strong> {{username}}</li>
                <li><strong>Email:</strong> {{email}}</li>
            </ul>
            <p>If you have any questions, feel free to reply to this email.</p>
            <div style="text-align: center; margin-top: 20px;">
                <a href="{{loginUrl}}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: #ffffff; text-decoration: none; border-radius: 4px;">Login to Your Account</a>
            </div>
        </div>
        <div style="text-align: center; padding: 20px 0; font-size: 12px; color: #6c757d; border-top: 1px solid #e9ecef;">
            <p>&copy; 2025 Your Company. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
`;

// Create initial template
async function createInitialTemplate() {
  try {
    // Check if template already exists
    const existingTemplate = await EmailTemplate.findOne({
      where: { name: "Welcome Email" },
    });

    if (!existingTemplate) {
      // Create new template
      await EmailTemplate.create({
        name: "Welcome Email",
        description: "Default template for welcoming new users",
        subject: "Welcome to Our Service, {{name}}!",
        html: sampleTemplate,
        text: "Hello {{name}}, Thank you for signing up! We're excited to have you onboard.",
      });

      logger.info("Initial email template created");
    } else {
      logger.info("Initial email template already exists");
    }
  } catch (error) {
    logger.error("Error creating initial template:", error);
  }
}

// Initialize the database
async function initializeDatabase() {
  try {
    // Test database connection
    await sequelize.authenticate();
    logger.info("Database connection successful");

    // Sync models
    await sequelize.sync({ alter: true });
    logger.info("Database models synchronized");

    // Create initial data
    await createInitialTemplate();

    logger.info("Database initialization completed");
  } catch (error) {
    logger.error("Database initialization failed:", error);
    process.exit(1);
  }
}

// Run the initialization
initializeDatabase().then(() => {
  process.exit(0);
});
