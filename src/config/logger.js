// src/utils/logger.js
const winston = require("winston");
const path = require("path");
require("dotenv").config();

// Define log format
const format = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

// Define console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Define log directory
const logDir = process.env.LOG_DIR || "logs";
const logFile = path.join(logDir, "app.log");
const errorLogFile = path.join(logDir, "error.log");

// Create the logger
const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format,
  defaultMeta: { service: "email-system" },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat,
    }),
    // File transports
    new winston.transports.File({
      filename: errorLogFile,
      level: "error",
    }),
    new winston.transports.File({
      filename: logFile,
    }),
  ],
  exitOnError: false,
});

module.exports = logger;
