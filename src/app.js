// src/app.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const emailRoutes = require("./routes/emailRoutes");
const { errorHandler } = require("./utils/errorHandler");
const logger = require("./utils/logger");

// Create Express app
const app = express();

// Apply middleware
app.use(helmet()); // Security headers
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : "*",
  })
);
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));

// Logging
app.use(
  morgan("combined", {
    stream: { write: (message) => logger.info(message.trim()) },
  })
);

// API routes
app.use("/api/email", emailRoutes);

// API 404 handler
app.use("/api/*", (req, res) => {
  res.status(404).json({ success: false, error: "API endpoint not found" });
});

// Root route
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Email tracking system API is running",
    version: "1.0.0",
  });
});

// Error handler
app.use(errorHandler);

module.exports = app;
