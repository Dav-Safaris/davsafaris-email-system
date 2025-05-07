// src/server.js
const app = require("./app");
const sequelize = require("./config/database");
const logger = require("./utils/logger");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Ensure logs directory exists
const logDir = process.env.LOG_DIR || "logs";
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Set port
const PORT = process.env.PORT || 3000;

// Initialize database and start server
const startServer = async () => {
  try {
    // Test database connection
    await sequelize.authenticate();
    logger.info("Database connection established");

    // Sync models with database
    if (
      process.env.NODE_ENV !== "production" ||
      process.env.SYNC_DB === "true"
    ) {
      await sequelize.sync({ alter: process.env.NODE_ENV !== "production" });
      logger.info("Database models synchronized");
    }

    // Start server
    app.listen(PORT, () => {
      logger.info(
        `Server running on port ${PORT} in ${
          process.env.NODE_ENV || "development"
        } mode`
      );
      logger.info(
        `Server URL: ${process.env.SERVER_URL || `http://localhost:${PORT}`}`
      );
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Start the server
startServer();

// Handle unhandled rejections
process.on("unhandledRejection", (err) => {
  logger.error("Unhandled Rejection:", err);
});

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception:", err);
  // Give time to log before exiting
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

// Handle termination signals
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  process.exit(0);
});
