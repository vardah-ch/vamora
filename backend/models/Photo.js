'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Photo extends Model {
    static associate(models) {
      Photo.belongsTo(models.User, { foreignKey: 'patientId' });
    }
  }

  Photo.init({
    id: { 
      type: DataTypes.UUID, 
      defaultValue: DataTypes.UUIDV4, 
      primaryKey: true 
    },
     patientId: { 
  type: DataTypes.INTEGER, 
  allowNull: false 
    },
    filename: { 
      type: DataTypes.STRING, 
      allowNull: false 
    },
    originalName: { 
      type: DataTypes.STRING 
    },
    caption: { 
      type: DataTypes.TEXT, 
      allowNull: false  // ✅ mandatory
    },
    takenAt: { 
      type: DataTypes.DATE 
    },
    voiceNoteUrl: {
      type: DataTypes.STRING
    },
    category: {
      type: DataTypes.ENUM('family', 'home', 'pet', 'memory'),
      allowNull: false,
      defaultValue: 'memory',
    },
    uploadedByUserId: { type: DataTypes.INTEGER, allowNull: true },
    mimeType: { type: DataTypes.STRING(64), allowNull: true },
    voiceNoteMime: { type: DataTypes.STRING(64), allowNull: true },
    voiceUploadedByUserId: { type: DataTypes.INTEGER, allowNull: true },
    patientConfirmed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    deletedAt: { type: DataTypes.DATE, allowNull: true },
    deletedByUserId: { type: DataTypes.INTEGER, allowNull: true },
  }, {
    sequelize,
    modelName: 'Photo',
  });

  return Photo;
};