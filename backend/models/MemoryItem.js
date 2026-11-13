'use strict';
const { Model } = require('sequelize');

/** Typed personal memory: written memory, important person, place, event or routine. */
module.exports = (sequelize, DataTypes) => {
  class MemoryItem extends Model {}
  MemoryItem.init({
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    patientUserId: { type: DataTypes.INTEGER, allowNull: false },
    type: { type: DataTypes.ENUM('written', 'person', 'place', 'event', 'routine'), allowNull: false, defaultValue: 'written' },
    title: { type: DataTypes.STRING(200), allowNull: false, validate: { len: [1, 200] } },
    content: { type: DataTypes.TEXT, allowNull: true },
    people: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    place: { type: DataTypes.STRING(200), allowNull: true },
    eventDate: { type: DataTypes.DATEONLY, allowNull: true },
    routineTime: { type: DataTypes.STRING(5), allowNull: true, validate: { is: /^([01]\d|2[0-3]):[0-5]\d$/ } },
    photoId: { type: DataTypes.UUID, allowNull: true },
    createdByUserId: { type: DataTypes.INTEGER, allowNull: true },
    patientConfirmed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    deletedAt: { type: DataTypes.DATE, allowNull: true },
    deletedByUserId: { type: DataTypes.INTEGER, allowNull: true }
  }, { sequelize, modelName: 'MemoryItem', tableName: 'memory_items', underscored: true, timestamps: true });
  return MemoryItem;
};
