// src/models/EmailTemplate.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const EmailTemplate = sequelize.define(
  "EmailTemplate",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    subject: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    html: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    text: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    indexes: [{ fields: ["name"] }, { fields: ["isActive"] }],
  }
);

module.exports = EmailTemplate;
