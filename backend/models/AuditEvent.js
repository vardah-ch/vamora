'use strict';
const { Model } = require('sequelize');

/**
 * Append-only audit record. The table has a trigger that rejects UPDATE and
 * DELETE. No message content, captions or media are ever stored here – only
 * who, what kind of action, which resource id, when, and the outcome.
 */
module.exports = (sequelize, DataTypes) => {
  class AuditEvent extends Model {}
  AuditEvent.init({
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    occurredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    actorUserId: { type: DataTypes.INTEGER, allowNull: true },
    actorRole: { type: DataTypes.STRING(32), allowNull: true },
    action: { type: DataTypes.STRING(64), allowNull: false },
    resourceType: { type: DataTypes.STRING(48), allowNull: true },
    resourceId: { type: DataTypes.STRING(64), allowNull: true },
    patientUserId: { type: DataTypes.INTEGER, allowNull: true },
    outcome: { type: DataTypes.ENUM('allowed', 'denied', 'error'), allowNull: false },
    reason: { type: DataTypes.STRING(200), allowNull: true },
    accessBasis: { type: DataTypes.STRING(64), allowNull: true },
    grantId: { type: DataTypes.INTEGER, allowNull: true },
    requestId: { type: DataTypes.STRING(40), allowNull: true }
  }, { sequelize, modelName: 'AuditEvent', tableName: 'audit_events', underscored: true, timestamps: false });
  return AuditEvent;
};
