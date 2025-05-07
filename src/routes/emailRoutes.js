// src/routes/emailRoutes.js
const express = require("express");
const router = express.Router();
const emailController = require("../controllers/emailController");
const emailService = require("../services/emailService");
const { authenticateApiKey } = require("../middleware/auth");

// Public tracking routes (no authentication)
router.get("/tracking/open/:trackingId", (req, res) => {
  try {
    emailService.handleOpen(req.params.trackingId, req);
    // Return a transparent 1x1 pixel
    res.set("Content-Type", "image/png");
    res.send(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/wcAAgAB/1h1ZAAAAABJRU5ErkJggg==",
        "base64"
      )
    );
  } catch (error) {
    res.status(500).send("Error tracking email open");
  }
});
router.get("/tracking/click/:trackingId", emailService.handleClick);

// Apply authentication middleware to protected routes
router.use(authenticateApiKey);

// Email sending routes
router.post("/send", emailController.sendEmail);
router.post("/bulk", emailController.sendBulkEmails);
router.get("/status/:id", emailController.getEmailStatus);
router.get("/batch/:batchId", emailController.getBatchStatus);
router.get("/queue/status", emailController.getQueueStatus);
router.get("/stats", emailController.getEmailStats);

// Template routes
router.get("/templates", emailController.getTemplates);
router.get("/templates/:id", emailController.getTemplate);
router.post("/templates", emailController.createTemplate);
router.put("/templates/:id", emailController.updateTemplate);
router.delete("/templates/:id", emailController.deleteTemplate);

module.exports = router;
