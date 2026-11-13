'use strict';
const { Model } = require('sequelize');

/** Cached dense embedding for one retrievable unit (photo or memory item). */
module.exports = (sequelize, DataTypes) => {
  class MemoryIndex extends Model {}
  MemoryIndex.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    patientUserId: { type: DataTypes.INTEGER, allowNull: false },
    sourceType: { type: DataTypes.STRING(16), allowNull: false },
    sourceId: { type: DataTypes.STRING(64), allowNull: false },
    contentHash: { type: DataTypes.STRING(64), allowNull: false },
    model: { type: DataTypes.STRING(120), allowNull: false },
    embedding: { type: DataTypes.JSONB, allowNull: false }
  }, { sequelize, modelName: 'MemoryIndex', tableName: 'memory_index', underscored: true, timestamps: true });
  return MemoryIndex;
};
