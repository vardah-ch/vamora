'use strict';
const { Model } = require('sequelize');

/** Explicit clinical care-team membership (replaces "every doctor sees every patient"). */
module.exports = (sequelize, DataTypes) => {
  class DoctorPatientAssignment extends Model {
    static associate(models) {
      DoctorPatientAssignment.belongsTo(models.User, { foreignKey: 'doctorUserId', as: 'doctorUser' });
      DoctorPatientAssignment.belongsTo(models.User, { foreignKey: 'patientUserId', as: 'patientUser' });
    }
  }
  DoctorPatientAssignment.init({
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    patientUserId: { type: DataTypes.INTEGER, allowNull: false },
    doctorUserId: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM('active', 'ended'), allowNull: false, defaultValue: 'active' },
    basis: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'clinical_assignment' },
    assignedByUserId: { type: DataTypes.INTEGER, allowNull: true },
    endedAt: { type: DataTypes.DATE, allowNull: true }
  }, { sequelize, modelName: 'DoctorPatientAssignment', tableName: 'doctor_patient_assignments', underscored: true, timestamps: true });
  return DoctorPatientAssignment;
};
