// src/models/EmailLog.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const EmailLog = sequelize.define(
  "EmailLog",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    to: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    subject: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM(
        "queued",
        "sending",
        "sent",
        "delivered",
        "opened",
        "clicked",
        "failed",
        "bounced"
      ),
      defaultValue: "queued",
    },
    jobId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    messageId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    openedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    openCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    clickAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    bounceAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    clickCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    ipAddress: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    country: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    region: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    city: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    deviceType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    browser: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    browserVersion: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    operatingSystem: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    osVersion: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    clickUrls: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    error: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
    },
  },
  {
    indexes: [
      { fields: ["to"] },
      { fields: ["status"] },
      { fields: ["messageId"] },
      { fields: ["sentAt"] },
      { fields: ["country"] },
    ],
  }
);

module.exports = EmailLog;
