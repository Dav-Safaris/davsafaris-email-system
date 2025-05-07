// src/services/emailService.js
const nodemailer = require("nodemailer");
const Queue = require("bull");
const { v4: uuidv4 } = require("uuid");
const geoip = require("geoip-lite");
const UAParser = require("ua-parser-js");
const EmailLog = require("../models/EmailLog");
const EmailTemplate = require("../models/EmailTemplate");
const emailConfig = require("../config/email");
const { redisClient, redisConfig } = require("../config/redis");
const logger = require("../utils/logger");

// Add Redis connection logging
redisClient.on("connect", () => {
  logger.info("Redis client connected successfully");
});

redisClient.on("error", (err) => {
  logger.error("Redis connection error:", err);
});

// Create email queue
const emailQueue = new Queue("email-queue", {
  redis: redisConfig,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: true,
    removeOnFail: 5000,
  },
});

// Add queue connection logging
emailQueue.client.on("connect", () => {
  logger.info("Bull queue connected to Redis");
});

emailQueue.client.on("error", (err) => {
  logger.error("Bull queue Redis error:", err);
});

// Nodemailer transporter
const transporter = emailConfig.createTransport();

// Add tracking to HTML
const addTrackingToEmail = (html, trackingId) => {
  if (!html) return html;

  const serverUrl = emailConfig.serverUrl;
  let modifiedHtml = html;

  // Add tracking pixel
  const trackingPixel = `<img src="${serverUrl}/api/email/tracking/open/${trackingId}" width="1" height="1" alt="" style="display:none;">`;
  modifiedHtml = html.includes("</body>")
    ? html.replace("</body>", `${trackingPixel}</body>`)
    : `${html}${trackingPixel}`;

  // Add click tracking
  if (emailConfig.trackClicks) {
    modifiedHtml = modifiedHtml.replace(
      /<a\s+(?:[^>]*?\s+)?href=(["'])(http[^"']+)\1/gi,
      (match, quote, url) => {
        const encodedUrl = encodeURIComponent(url);
        return `<a href=${quote}${serverUrl}/api/email/tracking/click/${trackingId}?url=${encodedUrl}${quote}`;
      }
    );
  }

  return modifiedHtml;
};

// IMPORTANT: Register processor BEFORE defining the service
// Process 'send-email' jobs
logger.info("Registering email job processor");
emailQueue.process("send-email", emailConfig.workerConcurrency, async (job) => {
  const {
    to,
    subject,
    text,
    html,
    cc,
    bcc,
    from,
    replyTo,
    attachments,
    metadata,
  } = job.data;
  logger.info(`Processing job ${job.id} → ${to}`);

  const trackingId = uuidv4();
  const emailLog = await EmailLog.create({
    id: trackingId,
    to,
    subject,
    status: "sending",
    jobId: job.id,
    metadata: metadata || {},
  });

  try {
    const mailOptions = {
      from: from || emailConfig.defaults.from,
      to,
      cc,
      bcc,
      subject,
      text,
      html: html ? addTrackingToEmail(html, trackingId) : undefined,
      replyTo: replyTo || emailConfig.defaults.replyTo,
      attachments,
      headers: { "X-Tracking-ID": trackingId },
    };

    const result = await transporter.sendMail(mailOptions);

    console.log("Email sent successfully:", result);
    await emailLog.update({
      status: "sent",
      messageId: result.messageId,
      sentAt: new Date(),
    });
    await redisClient.hincrby("email:metrics", "sent", 1);

    logger.info(`Email sent to ${to}, message ID: ${result.messageId}`);
    return result;
  } catch (error) {
    logger.error(`Failed to send email to ${to}: ${error}`);

    await emailLog.update({ status: "failed", error: error.message });
    await redisClient.hincrby("email:metrics", "failed", 1);
    throw error;
  }
});

// Queue event listeners
emailQueue.on("completed", (job) => {
  logger.info(`Job ${job.id} completed`);
});

emailQueue.on("failed", (job, error) => {
  logger.error(`Job ${job.id} failed: ${error.message}`);
});

// Verify processor registration
setTimeout(() => {
  logger.info("Checking queue processor registration...");
  emailQueue
    .getWorkers()
    .then((workers) => {
      logger.info(`Queue has ${workers.length} workers registered`);
    })
    .catch((err) => {
      logger.error("Error checking workers:", err);
    });
}, 2000);

// Email service functions (moved after processor registration)
const emailService = {
  sendEmail: async (emailData) => {
    try {
      if (emailData.templateId) {
        const template = await EmailTemplate.findByPk(emailData.templateId);
        if (!template)
          throw new Error(`Template with ID ${emailData.templateId} not found`);

        let { html, text, subject } = template;
        if (emailData.templateData) {
          Object.entries(emailData.templateData).forEach(([key, value]) => {
            const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g");
            html = html.replace(regex, value || "");
            text = text.replace(regex, value || "");
            subject = subject.replace(regex, value || "");
          });
        }

        emailData.html = html;
        emailData.text = text;
        emailData.subject = subject;
      }

      const job = await emailQueue.add("send-email", emailData);
      logger.info(`Email to ${emailData.to} queued (job ID: ${job.id})`);

      return {
        success: true,
        jobId: job.id,
        message: "Email queued successfully",
      };
    } catch (error) {
      logger.error("Error queuing email:", error);
      throw error;
    }
  },

  sendBulkEmails: async (emails) => {
    try {
      const batchId = `batch-${Date.now()}`;
      const jobs = [];

      for (const email of emails) {
        if (email.templateId) {
          const template = await EmailTemplate.findByPk(email.templateId);
          if (!template)
            throw new Error(`Template with ID ${email.templateId} not found`);

          let { html, text, subject } = template;
          if (email.templateData) {
            Object.entries(email.templateData).forEach(([key, value]) => {
              const regex = new RegExp(`{{\\s*${key}\\s*}}`, "g");
              html = html.replace(regex, value || "");
              text = text.replace(regex, value || "");
              subject = subject.replace(regex, value || "");
            });
          }

          email.html = html;
          email.text = text;
          email.subject = subject;
        }

        email.metadata = { ...email.metadata, batchId };
        jobs.push({ name: "send-email", data: email });
      }

      await emailQueue.addBulk(jobs);
      logger.info(
        `Bulk email batch ${batchId} queued with ${jobs.length} emails`
      );

      return {
        success: true,
        count: jobs.length,
        batchId,
        message: `${jobs.length} emails queued successfully`,
      };
    } catch (error) {
      logger.error("Error queuing bulk emails:", error);
      throw error;
    }
  },

  handleOpen: async (trackingId, req) => {
    try {
      const emailLog = await EmailLog.findByPk(trackingId);
      if (emailLog) {
        const geo = geoip.lookup(req.ip);
        const userAgent = new UAParser(req.headers["user-agent"]).getResult();

        const deviceType =
          userAgent.device.type ||
          (userAgent.os.name?.toLowerCase().includes("android")
            ? "mobile"
            : "desktop");

        await emailLog.update({
          openCount: emailLog.openCount + 1,
          openedAt: new Date(),
          ipAddress: req.ip,
          country: geo?.country || "Unknown",
          region: geo?.region || "Unknown",
          city: geo?.city || "Unknown",
          deviceType: userAgent.device.type || "desktop",
          browser: userAgent.browser.name,
          browserVersion: userAgent.browser.version,
          operatingSystem: userAgent.os.name,
          osVersion: userAgent.os.version,
        });

        await redisClient.hincrby("email:metrics", "opened", 1);
        logger.info(`Email ${trackingId} opened by ${req.ip}`);
      }
    } catch (error) {
      logger.error(`Error tracking email open: ${error.message}`);
      throw error;
    }
  },

  handleClick: async (req, res) => {
    const { trackingId } = req.params;
    const { url } = req.query;
    try {
      if (!url) return res.status(400).send("Missing URL parameter");

      const decodedUrl = decodeURIComponent(url);
      const emailLog = await EmailLog.findByPk(trackingId);
      if (emailLog) {
        const ip = req.headers["x-forwarded-for"] || req.ip;
        const userAgent = req.headers["user-agent"];
        const geo = ip ? geoip.lookup(ip) : null;
        const parser = new UAParser(userAgent);
        const browser = parser.getBrowser();
        const os = parser.getOS();
        const device = parser.getDevice();

        await emailLog.update({
          status: "clicked",
          clickedAt: new Date(),
          clickUrl: decodedUrl,
          ipAddress: ip,
          country: geo?.country || emailLog.country,
          region: geo?.region || emailLog.region,
          city: geo?.city || emailLog.city,
          deviceType: device.type,
          browser: browser.name,
          operatingSystem: os.name,
          metadata: {
            ...emailLog.metadata,
            clickDetails: {
              timestamp: new Date().toISOString(),
              url: decodedUrl,
              ip,
              userAgent,
            },
          },
        });

        await redisClient.hincrby("email:metrics", "clicked", 1);
        if (geo?.country)
          await redisClient.hincrby("email:clicks:country", geo.country, 1);

        const urlHash = Buffer.from(decodedUrl)
          .toString("base64")
          .substring(0, 32);
        await redisClient.hincrby("email:clicks:url", urlHash, 1);

        logger.info(`Email link clicked: ${trackingId}, URL: ${decodedUrl}`);
      }

      return res.redirect(decodedUrl);
    } catch (error) {
      logger.error(`Error tracking click: ${error.message}`);
      if (url) return res.redirect(decodeURIComponent(url));
      return res.status(400).send("Invalid request");
    }
  },

  getEmailStats: async () => {
    try {
      // Get all statistics in parallel
      const [
        statusCounts,
        totalEmails,
        deviceStats,
        countryStats,
        browserStats,
        osStats,
        queueStatus,
        redisMetrics,
      ] = await Promise.all([
        EmailLog.findAll({
          attributes: [
            "status",
            [Sequelize.fn("COUNT", Sequelize.col("status")), "count"],
          ],
          group: ["status"],
        }),
        EmailLog.count(),
        EmailLog.findAll({
          attributes: [
            "deviceType",
            [Sequelize.fn("COUNT", Sequelize.col("deviceType")), "count"],
          ],
          where: { deviceType: { [Op.ne]: null } },
          group: ["deviceType"],
          order: [[Sequelize.literal("count"), "DESC"]],
        }),
        EmailLog.findAll({
          attributes: [
            "country",
            [Sequelize.fn("COUNT", Sequelize.col("country")), "count"],
          ],
          where: { country: { [Op.ne]: null } },
          group: ["country"],
          order: [[Sequelize.literal("count"), "DESC"]],
        }),
        EmailLog.findAll({
          attributes: [
            "browser",
            [Sequelize.fn("COUNT", Sequelize.col("browser")), "count"],
          ],
          where: { browser: { [Op.ne]: null } },
          group: ["browser"],
          order: [[Sequelize.literal("count"), "DESC"]],
        }),
        EmailLog.findAll({
          attributes: [
            "operatingSystem",
            [Sequelize.fn("COUNT", Sequelize.col("operatingSystem")), "count"],
          ],
          where: { operatingSystem: { [Op.ne]: null } },
          group: ["operatingSystem"],
          order: [[Sequelize.literal("count"), "DESC"]],
        }),
        emailQueue.getJobCounts(),
        redisClient.hgetall("email:metrics"),
      ]);

      // Format all statistics
      const formattedStats = {
        totalEmails,
        statusCounts: statusCounts.reduce((acc, curr) => {
          acc[curr.status] = parseInt(curr.get("count"));
          return acc;
        }, {}),
        deviceStats: deviceStats.reduce((acc, curr) => {
          acc[curr.deviceType] = parseInt(curr.get("count"));
          return acc;
        }, {}),
        countryStats: countryStats.reduce((acc, curr) => {
          acc[curr.country] = parseInt(curr.get("count"));
          return acc;
        }, {}),
        browserStats: browserStats.reduce((acc, curr) => {
          acc[curr.browser] = parseInt(curr.get("count"));
          return acc;
        }, {}),
        osStats: osStats.reduce((acc, curr) => {
          acc[curr.operatingSystem] = parseInt(curr.get("count"));
          return acc;
        }, {}),
        queueStatus,
        redisMetrics: {
          sent: parseInt(redisMetrics?.sent || 0),
          delivered: parseInt(redisMetrics?.delivered || 0),
          opened: parseInt(redisMetrics?.opened || 0),
          clicked: parseInt(redisMetrics?.clicked || 0),
          failed: parseInt(redisMetrics?.failed || 0),
        },
      };

      // Calculate rates
      if (totalEmails > 0) {
        formattedStats.deliveryRate =
          (formattedStats.redisMetrics.delivered / totalEmails) * 100;
        formattedStats.bounceRate =
          (formattedStats.statusCounts.bounced / totalEmails) * 100;
        formattedStats.openRate =
          (formattedStats.redisMetrics.opened / totalEmails) * 100;
        formattedStats.clickRate =
          (formattedStats.redisMetrics.clicked / totalEmails) * 100;
      } else {
        formattedStats.deliveryRate = 0;
        formattedStats.bounceRate = 0;
        formattedStats.openRate = 0;
        formattedStats.clickRate = 0;
      }

      return {
        success: true,
        data: formattedStats,
      };
    } catch (error) {
      logger.error("Error getting email stats:", error);
      throw error;
    }
  },
};

getQueueStatus: async () => {
  try {
    const counts = await emailQueue.getJobCounts();
    const metrics = (await redisClient.hgetall("email:metrics")) || {};
    return {
      success: true,
      queue: counts,
      metrics: {
        sent: parseInt(metrics.sent || 0),
        delivered: parseInt(metrics.delivered || 0),
        opened: parseInt(metrics.opened || 0),
        clicked: parseInt(metrics.clicked || 0),
        failed: parseInt(metrics.failed || 0),
      },
    };
  } catch (error) {
    logger.error("Error getting queue status:", error);
    throw error;
  }
},
  (module.exports = {
    sendEmail: emailService.sendEmail,
    sendBulkEmails: emailService.sendBulkEmails,
    handleOpen: emailService.handleOpen,
    handleClick: emailService.handleClick,
    getQueueStatus: emailService.getQueueStatus,
    getEmailStats: emailService.getEmailStats,
    emailQueue,
  });
