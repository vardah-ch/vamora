'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Mood extends Model {
    static associate(models) {
      Mood.belongsTo(models.User, { foreignKey: 'patientId' });
    }
  }

  Mood.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    patientId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    mood: {
      type: DataTypes.STRING,
      allowNull: false
    },
    note: {
      type: DataTypes.TEXT
    },
    source: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'manual',
      // manual           – patient chose the mood (self-report)
      // camera_confirmed – camera gave an expression ESTIMATE that the patient
      //                    confirmed or corrected before saving (self-report)
      // camera           – legacy, saved without confirmation; excluded from
      //                    alerts and summaries
      validate: { isIn: [['manual', 'camera', 'camera_confirmed']] }
    },
    recordedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    inference: { type: DataTypes.JSONB, allowNull: true }
  }, {
    sequelize,
    modelName: 'Mood',
  });

  return Mood;
};