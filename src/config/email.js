// src/config/email.js
const nodemailer = require("nodemailer");
const { cpus } = require("os");
const logger = require("../utils/logger");
require("dotenv").config();

// Calculate optimal worker count
const availableCpus = cpus().length;
const workerCount = process.env.EMAIL_WORKER_COUNT
  ? parseInt(process.env.EMAIL_WORKER_COUNT, 10)
  : Math.max(2, availableCpus - 1);

// Email configuration
const config = {
  // Transport options for nodemailer
  transport: {
    pool: true,
    maxConnections: 25,
    maxMessages: 100,
    rateDelta: 1000,
    rateLimit: 50,
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    tls: {
      rejectUnauthorized: process.env.NODE_ENV === "production",
    },
  },

  // Default email options
  defaults: {
    from: `"${process.env.EMAIL_FROM_NAME || "Email System"}" <${
      process.env.EMAIL_FROM_ADDRESS || "noreply@example.com"
    }>`,
    replyTo:
      process.env.EMAIL_REPLY_TO ||
      process.env.EMAIL_FROM_ADDRESS ||
      "noreply@example.com",
  },

  // Worker configuration
  workerCount,
  maxEmailsPerWorker: parseInt(process.env.MAX_EMAILS_PER_WORKER, 10) || 1000,
  workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY, 10) || 5,

  // Tracking configuration
  trackOpens: process.env.TRACK_OPENS !== "false",
  trackClicks: process.env.TRACK_CLICKS !== "false",

  // Server URL (for tracking links)
  serverUrl:
    process.env.SERVER_URL ||
    `http://${process.env.SERVER_IP || "localhost"}:${
      process.env.PORT || 3000
    }`,

  // Create a reusable transporter
  createTransport: () => {
    return nodemailer.createTransport(config.transport, config.defaults);
  },
};

logger.info(`Email Config: ${config}`);

module.exports = config;
