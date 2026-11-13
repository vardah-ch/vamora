'use strict';
const db = require('../../models');

/**
 * Care-team bookkeeping. `access_grants` is the source of truth for what a
 * caregiver may do; `patient_caregiver_relationships` is kept in sync for the
 * existing Sequelize associations used by dashboards.
 */
async function ensureRelationship(patientId, caregiverId, transaction) {
  await db.sequelize.query(
    `INSERT INTO patient_caregiver_relationships (patient_id, caregiver_id, created_at, updated_at)
     SELECT :pid, :cid, NOW(), NOW()
      WHERE NOT EXISTS (SELECT 1 FROM patient_caregiver_relationships WHERE patient_id = :pid AND caregiver_id = :cid)`,
    { replacements: { pid: patientId, cid: caregiverId }, transaction }
  );
}

async function removeRelationship(patientId, caregiverId, transaction) {
  await db.sequelize.query(
    'DELETE FROM patient_caregiver_relationships WHERE patient_id = :pid AND caregiver_id = :cid',
    { replacements: { pid: patientId, cid: caregiverId }, transaction }
  );
}

/** Caregiver profile + user for a grantee user id (null when not a caregiver). */
async function caregiverForUser(userId) {
  return db.Caregiver.findOne({ where: { userId } });
}

module.exports = { ensureRelationship, removeRelationship, caregiverForUser };
