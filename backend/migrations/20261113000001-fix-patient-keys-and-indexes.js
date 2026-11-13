'use strict';

/**
 * Non-destructive fix for audit finding B1.
 *
 * `appointments.patient_id` and `care_notes.patient_id` were created with a
 * foreign key to `patients.id`, but every code path writes the patient's
 * `users.id` into them (the convention used by Photos, Moods, ChatMessages,
 * medications and mmse_scores). This migration re-points those FKs at
 * `users.id` so the schema matches the data actually written.
 *
 * Safety: no rows are deleted or rewritten. If any existing value does not
 * correspond to a users.id, the migration aborts and lists the offending
 * rows so a human can decide what to do.
 *
 * It also adds indexes that every patient-scoped query needs.
 */

async function dropFkOn(queryInterface, table, column) {
  const [rows] = await queryInterface.sequelize.query(`
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY (con.conkey)
     WHERE con.contype = 'f' AND rel.relname = :table AND att.attname = :column`,
  { replacements: { table, column } });
  for (const r of rows) {
    await queryInterface.sequelize.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${r.conname}"`);
  }
}

async function assertValuesAreUsers(queryInterface, table) {
  const [orphans] = await queryInterface.sequelize.query(
    `SELECT t.id, t.patient_id FROM "${table}" t
      LEFT JOIN users u ON u.id = t.patient_id
     WHERE u.id IS NULL`
  );
  if (orphans.length) {
    throw new Error(
      `Migration aborted: ${orphans.length} row(s) in ${table} have patient_id values that are not users.id ` +
      `(${JSON.stringify(orphans.slice(0, 10))}). Review manually; no data was changed.`
    );
  }
}

async function safeIndex(queryInterface, table, fields, options = {}) {
  try {
    await queryInterface.addIndex(table, fields, options);
  } catch (e) {
    if (!/already exists/i.test(e.message)) throw e;
  }
}

module.exports = {
  async up(queryInterface) {
    for (const table of ['appointments', 'care_notes']) {
      await assertValuesAreUsers(queryInterface, table);
      await dropFkOn(queryInterface, table, 'patient_id');
      await queryInterface.sequelize.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "${table}_patient_user_fkey"
           FOREIGN KEY (patient_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE`
      );
    }

    await safeIndex(queryInterface, 'Photos', ['patientId']);
    await safeIndex(queryInterface, 'Moods', ['patientId', 'recordedAt']);
    await safeIndex(queryInterface, 'ChatMessages', ['patientId', 'createdAt']);
    await safeIndex(queryInterface, 'medications', ['patient_id']);
    await safeIndex(queryInterface, 'mmse_scores', ['patient_id', 'assessment_date']);
    await safeIndex(queryInterface, 'appointments', ['patient_id', 'appointment_date']);
    await safeIndex(queryInterface, 'care_notes', ['patient_id', 'created_at']);

    // Unique caregiver↔patient pair, only if the existing data allows it.
    const [dups] = await queryInterface.sequelize.query(
      `SELECT patient_id, caregiver_id, COUNT(*) c FROM patient_caregiver_relationships
        GROUP BY patient_id, caregiver_id HAVING COUNT(*) > 1`
    );
    if (dups.length === 0) {
      await safeIndex(queryInterface, 'patient_caregiver_relationships', ['patient_id', 'caregiver_id'], {
        unique: true, name: 'pcr_patient_caregiver_unique'
      });
    } else {
      console.warn(`[migration] ${dups.length} duplicate caregiver relationships found; unique index skipped.`);
      await safeIndex(queryInterface, 'patient_caregiver_relationships', ['patient_id', 'caregiver_id']);
    }
  },

  async down(queryInterface) {
    for (const table of ['appointments', 'care_notes']) {
      await queryInterface.sequelize.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${table}_patient_user_fkey"`
      );
      // The original (incorrect) FK to patients.id is intentionally NOT restored:
      // existing rows hold users.id values and would violate it.
    }
  }
};
