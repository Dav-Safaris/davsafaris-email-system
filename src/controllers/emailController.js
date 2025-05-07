// src/controllers/emailController.js
const { ApiError } = require("../utils/errorHandler");
const emailService = require("../services/emailService");
const EmailLog = require("../models/EmailLog");
const EmailTemplate = require("../models/EmailTemplate");
const logger = require("../utils/logger");
const { Op, Sequelize } = require("sequelize");

// Email controller functions
const emailController = {
  // Send a single email
  sendEmail: async (req, res, next) => {
    try {
      const { to, subject, text, html, cc, bcc, templateId, templateData } =
        req.body;

      // Basic validation
      if (!to) {
        throw new ApiError("Recipient email is required", 400);
      }

      if (!subject && !templateId) {
        throw new ApiError("Subject is required", 400);
      }

      if (!text && !html && !templateId) {
        throw new ApiError("Email content or template ID is required", 400);
      }

      // Send email
      const result = await emailService.sendEmail({
        to,
        subject,
        text,
        html,
        cc,
        bcc,
        templateId,
        templateData,
        metadata: {
          userId: req.user?.id,
          ip: req.ip,
        },
      });

      res.status(202).json(result);
    } catch (error) {
      next(error);
    }
  },

  // Send bulk emails
  sendBulkEmails: async (req, res, next) => {
    try {
      const { emails, templateId } = req.body;

      // Validate input
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        throw new ApiError("Invalid emails array", 400);
      }

      // Process each email
      const processedEmails = emails.map((email) => {
        if (!email.to) {
          throw new ApiError("Each email must have a recipient", 400);
        }

        return {
          ...email,
          templateId: email.templateId || templateId,
          metadata: {
            ...email.metadata,
            userId: req.user?.id,
            ip: req.ip,
          },
        };
      });

      // Send bulk emails
      const result = await emailService.sendBulkEmails(processedEmails);

      res.status(202).json(result);
    } catch (error) {
      next(error);
    }
  },

  // Get email status
  getEmailStatus: async (req, res, next) => {
    try {
      const { id } = req.params;

      const email = await EmailLog.findByPk(id);

      if (!email) {
        throw new ApiError("Email not found", 404);
      }

      res.json({
        success: true,
        data: {
          id: email.id,
          to: email.to,
          subject: email.subject,
          status: email.status,
          sentAt: email.sentAt,
          openedAt: email.openedAt,
          clickedAt: email.clickedAt,
          error: email.error,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Get batch status
  getBatchStatus: async (req, res, next) => {
    try {
      const { batchId } = req.params;

      // Get emails in batch
      const emails = await EmailLog.findAll({
        where: {
          metadata: {
            batchId,
          },
        },
        attributes: [
          "status",
          [Sequelize.fn("count", Sequelize.col("status")), "count"],
        ],
        group: ["status"],
      });

      if (emails.length === 0) {
        throw new ApiError("Batch not found", 404);
      }

      // Format response
      const stats = {};
      let total = 0;

      emails.forEach((stat) => {
        const count = parseInt(stat.get("count"));
        stats[stat.status] = count;
        total += count;
      });

      res.json({
        success: true,
        data: {
          batchId,
          total,
          stats,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Get queue status
  getQueueStatus: async (req, res, next) => {
    try {
      const status = await emailService.getQueueStatus();
      res.json(status);
    } catch (error) {
      next(error);
    }
  },

  // Get email templates
  getTemplates: async (req, res, next) => {
    try {
      const templates = await EmailTemplate.findAll({
        attributes: [
          "id",
          "name",
          "description",
          "subject",
          "createdAt",
          "updatedAt",
        ],
      });

      res.json({
        success: true,
        data: templates,
      });
    } catch (error) {
      next(error);
    }
  },

  // Get template by ID
  getTemplate: async (req, res, next) => {
    try {
      const { id } = req.params;

      const template = await EmailTemplate.findByPk(id);

      if (!template) {
        throw new ApiError("Template not found", 404);
      }

      res.json({
        success: true,
        data: template,
      });
    } catch (error) {
      next(error);
    }
  },

  // Create template
  createTemplate: async (req, res, next) => {
    try {
      const { name, description, subject, html, text } = req.body;

      // Validate input
      if (!name) {
        throw new ApiError("Template name is required", 400);
      }

      if (!subject) {
        throw new ApiError("Template subject is required", 400);
      }

      if (!html) {
        throw new ApiError("Template HTML content is required", 400);
      }

      // Create template
      const template = await EmailTemplate.create({
        name,
        description,
        subject,
        html,
        text,
      });

      res.status(201).json({
        success: true,
        data: template,
      });
    } catch (error) {
      next(error);
    }
  },

  // Update template
  updateTemplate: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { name, description, subject, html, text } = req.body;

      const template = await EmailTemplate.findByPk(id);

      if (!template) {
        throw new ApiError("Template not found", 404);
      }

      // Update template
      await template.update({
        name: name || template.name,
        description:
          description !== undefined ? description : template.description,
        subject: subject || template.subject,
        html: html || template.html,
        text: text !== undefined ? text : template.text,
      });

      res.json({
        success: true,
        data: template,
      });
    } catch (error) {
      next(error);
    }
  },

  // Delete template
  deleteTemplate: async (req, res, next) => {
    try {
      const { id } = req.params;

      const template = await EmailTemplate.findByPk(id);

      if (!template) {
        throw new ApiError("Template not found", 404);
      }

      await template.destroy();

      res.json({
        success: true,
        message: "Template deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = {
  // Send a single email
  sendEmail: async (req, res, next) => {
    try {
      const { to, subject, text, html, cc, bcc, templateId, templateData } =
        req.body;

      // Basic validation
      if (!to) {
        throw new ApiError("Recipient email is required", 400);
      }

      if (!subject && !templateId) {
        throw new ApiError("Subject is required", 400);
      }

      if (!text && !html && !templateId) {
        throw new ApiError("Email content or template ID is required", 400);
      }

      // Send email
      const result = await emailService.sendEmail({
        to,
        subject,
        text,
        html,
        cc,
        bcc,
        templateId,
        templateData,
        metadata: {
          userId: req.user?.id,
          ip: req.ip,
        },
      });

      res.status(202).json(result);
    } catch (error) {
      next(error);
    }
  },

  // Send bulk emails
  sendBulkEmails: async (req, res, next) => {
    try {
      const { emails, templateId } = req.body;

      // Validate input
      if (!emails || !Array.isArray(emails) || emails.length === 0) {
        throw new ApiError("Invalid emails array", 400);
      }

      // Process each email
      const processedEmails = emails.map((email) => {
        if (!email.to) {
          throw new ApiError("Each email must have a recipient", 400);
        }

        return {
          ...email,
          templateId: email.templateId || templateId,
          metadata: {
            ...email.metadata,
            userId: req.user?.id,
            ip: req.ip,
          },
        };
      });

      // Send bulk emails
      const result = await emailService.sendBulkEmails(processedEmails);

      res.status(202).json(result);
    } catch (error) {
      next(error);
    }
  },

  // Get email status
  getEmailStatus: async (req, res, next) => {
    try {
      const { id } = req.params;

      const email = await EmailLog.findByPk(id);

      if (!email) {
        throw new ApiError("Email not found", 404);
      }

      res.json({
        success: true,
        data: {
          id: email.id,
          to: email.to,
          subject: email.subject,
          status: email.status,
          sentAt: email.sentAt,
          openedAt: email.openedAt,
          clickedAt: email.clickedAt,
          error: email.error,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Get batch status
  getBatchStatus: async (req, res, next) => {
    try {
      const { batchId } = req.params;

      // Get emails in batch
      const emails = await EmailLog.findAll({
        where: {
          metadata: {
            batchId,
          },
        },
        attributes: [
          "status",
          [Sequelize.fn("count", Sequelize.col("status")), "count"],
        ],
        group: ["status"],
      });

      if (emails.length === 0) {
        throw new ApiError("Batch not found", 404);
      }

      // Format response
      const stats = {};
      let total = 0;

      emails.forEach((stat) => {
        const count = parseInt(stat.get("count"));
        stats[stat.status] = count;
        total += count;
      });

      res.json({
        success: true,
        data: {
          batchId,
          total,
          stats,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // Get queue status
  getQueueStatus: async (req, res, next) => {
    try {
      const status = await emailService.getQueueStatus();
      res.json(status);
    } catch (error) {
      next(error);
    }
  },

  // Get email templates
  getTemplates: async (req, res, next) => {
    try {
      const templates = await EmailTemplate.findAll({
        attributes: [
          "id",
          "name",
          "description",
          "subject",
          "createdAt",
          "updatedAt",
        ],
      });

      res.json({
        success: true,
        data: templates,
      });
    } catch (error) {
      next(error);
    }
  },

  // Get template by ID
  getTemplate: async (req, res, next) => {
    try {
      const { id } = req.params;

      const template = await EmailTemplate.findByPk(id);

      if (!template) {
        throw new ApiError("Template not found", 404);
      }

      res.json({
        success: true,
        data: template,
      });
    } catch (error) {
      next(error);
    }
  },

  // Create template
  createTemplate: async (req, res, next) => {
    try {
      const { name, description, subject, html, text } = req.body;

      // Validate input
      if (!name) {
        throw new ApiError("Template name is required", 400);
      }

      if (!subject) {
        throw new ApiError("Template subject is required", 400);
      }

      if (!html) {
        throw new ApiError("Template HTML content is required", 400);
      }

      // Create template
      const template = await EmailTemplate.create({
        name,
        description,
        subject,
        html,
        text,
      });

      res.status(201).json({
        success: true,
        data: template,
      });
    } catch (error) {
      next(error);
    }
  },

  // Update template
  updateTemplate: async (req, res, next) => {
    try {
      const { id } = req.params;
      const { name, description, subject, html, text } = req.body;

      const template = await EmailTemplate.findByPk(id);

      if (!template) {
        throw new ApiError("Template not found", 404);
      }

      // Update template
      await template.update({
        name: name || template.name,
        description:
          description !== undefined ? description : template.description,
        subject: subject || template.subject,
        html: html || template.html,
        text: text !== undefined ? text : template.text,
      });

      res.json({
        success: true,
        data: template,
      });
    } catch (error) {
      next(error);
    }
  },

  // Delete template
  deleteTemplate: async (req, res, next) => {
    try {
      const { id } = req.params;

      const template = await EmailTemplate.findByPk(id);

      if (!template) {
        throw new ApiError("Template not found", 404);
      }

      await template.destroy();

      res.json({
        success: true,
        message: "Template deleted successfully",
      });
    } catch (error) {
      next(error);
    }
  },
  getEmailStats: async (req, res) => {
    try {
      // Get all statistics in parallel
      const [
        statusCounts,
        totalEmails,
        emailsByCountry,
        emailsByDevice,
        deliveryStats,
        bounceStats,
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
            "country",
            [Sequelize.fn("COUNT", Sequelize.col("country")), "count"],
          ],
          where: { country: { [Op.ne]: null } },
          group: ["country"],
          order: [[Sequelize.literal("count"), "DESC"]],
          limit: 10,
        }),
        EmailLog.findAll({
          attributes: [
            "deviceType",
            [Sequelize.fn("COUNT", Sequelize.col("deviceType")), "count"],
          ],
          where: { deviceType: { [Op.ne]: null } },
          group: ["deviceType"],
          order: [[Sequelize.literal("count"), "DESC"]],
        }),
        EmailLog.count({ where: { status: "delivered" } }),
        EmailLog.count({ where: { status: "bounced" } }),
      ]);

      // Calculate rates
      const rates = {};
      const statusCountsObj = statusCounts.reduce((acc, curr) => {
        const count = parseInt(curr.get("count"));
        acc[curr.status] = count;
        if (totalEmails > 0) {
          rates[`${curr.status}Rate`] = (count / totalEmails) * 100;
        } else {
          rates[`${curr.status}Rate`] = 0;
        }
        return acc;
      }, {});

      // Format response
      const stats = {
        totalEmails,
        statusCounts: statusCountsObj,
        rates,
        deliveryStats: {
          count: deliveryStats,
          rate: totalEmails > 0 ? (deliveryStats / totalEmails) * 100 : 0,
        },
        bounceStats: {
          count: bounceStats,
          rate: totalEmails > 0 ? (bounceStats / totalEmails) * 100 : 0,
        },
        topCountries: emailsByCountry.map((country) => ({
          country: country.country,
          count: parseInt(country.get("count")),
        })),
        deviceUsage: emailsByDevice.map((device) => ({
          device: device.deviceType,
          count: parseInt(device.get("count")),
        })),
      };

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Failed to get email statistics",
        error: error.message,
      });
    }
  },
};
