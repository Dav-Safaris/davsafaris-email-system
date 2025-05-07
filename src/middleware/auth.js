// src/middleware/auth.js
const { ApiError } = require("../utils/errorHandler");
const logger = require("../utils/logger");

// API key authentication middleware
const authenticateApiKey = (req, res, next) => {
  try {
    // Skip authentication in development if configured
    if (
      process.env.NODE_ENV === "development" &&
      process.env.SKIP_AUTH === "true"
    ) {
      return next();
    }

    // Get API key from header
    const apiKey = req.headers["x-api-key"];

    if (!apiKey) {
      throw new ApiError("API key is required", 401);
    }

    // Validate API key (in a real app, you would check against a database)
    if (
      apiKey === process.env.API_KEY ||
      apiKey === process.env.ADMIN_API_KEY
    ) {
      // Attach user info to request (useful for audit logs)
      req.user = {
        id: apiKey === process.env.ADMIN_API_KEY ? "admin" : "api-user",
        isAdmin: apiKey === process.env.ADMIN_API_KEY,
      };
      return next();
    }

    throw new ApiError("Invalid API key", 401);
  } catch (error) {
    logger.warn(`Authentication failure: ${error.message}`);
    next(error);
  }
};

// Admin authorization middleware
const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return next(new ApiError("Admin access required", 403));
  }
  next();
};

module.exports = {
  authenticateApiKey,
  requireAdmin,
};
