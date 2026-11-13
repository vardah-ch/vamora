'use strict';
const { Model } = require('sequelize');

/**
 * Consent-aware access grant: what a specific person may do with a specific
 * patient's information, why (basis), and whether the patient (or their
 * recorded representative) has approved it.
 */
module.exports = (sequelize, DataTypes) => {
  class AccessGrant extends Model {
    static associate(models) {
      AccessGrant.belongsTo(models.User, { foreignKey: 'granteeUserId', as: 'grantee' });
      AccessGrant.belongsTo(models.User, { foreignKey: 'patientUserId', as: 'patientUser' });
    }
  }
  AccessGrant.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    patientUserId: { type: DataTypes.INTEGER, allowNull: false },
    granteeUserId: { type: DataTypes.INTEGER, allowNull: false },
    permissions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    status: { type: DataTypes.ENUM('pending', 'active', 'revoked', 'declined'), allowNull: false, defaultValue: 'pending' },
    basis: { type: DataTypes.STRING(64), allowNull: false },
    relationshipLabel: { type: DataTypes.STRING(100), allowNull: true },
    needsReview: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    requestedByUserId: { type: DataTypes.INTEGER, allowNull: true },
    decidedByUserId: { type: DataTypes.INTEGER, allowNull: true },
    decidedAt: { type: DataTypes.DATE, allowNull: true },
    revokedAt: { type: DataTypes.DATE, allowNull: true }
  }, { sequelize, modelName: 'AccessGrant', tableName: 'access_grants', underscored: true, timestamps: true });
  return AccessGrant;
};
