// src/config/redis.js
const Redis = require("ioredis");
const logger = require("../utils/logger");
require("dotenv").config();

// Redis configuration
const redisConfig = {
  host: process.env.REDIS_HOST || "localhost",
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD,
  tls: process.env.REDIS_TLS === "true" ? {} : undefined,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
};

// Create Redis client
const redisClient = new Redis(redisConfig);

// Handle Redis events
redisClient.on("connect", () => {
  logger.info("Redis client connected");
});

redisClient.on("error", (error) => {
  logger.error("Redis client error:", error);
});

module.exports = {
  redisClient,
  redisConfig,
};
