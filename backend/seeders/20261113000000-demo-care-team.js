'use strict';
/**
 * Demo care team for local development and demonstrations (SYNTHETIC data).
 * Idempotent: safe to run more than once. Requires the earlier demo seeders.
 *
 *   sarah.patient@vamora.com   – patient "Sarah Johnson"
 *   amna.caregiver@vamora.com  – caregiver, shares moods/appointments/photos
 *   sarah.md@vamora.com        – doctor assigned to Sarah
 * Password for all demo accounts: password123 (development only).
 */
module.exports = {
  async up(queryInterface) {
    const q = (sql, replacements) => queryInterface.sequelize.query(sql, { replacements, type: queryInterface.sequelize.QueryTypes.SELECT });
    const [patientUser] = await q(`SELECT id FROM users WHERE email = 'sarah.patient@vamora.com'`);
    const [carerUser] = await q(`SELECT id FROM users WHERE email = 'amna.caregiver@vamora.com'`);
    const doctors = await q(`SELECT id, email FROM users WHERE role = 'doctor' AND email IN ('sarah.md@vamora.com','james.md@vamora.com')`);
    if (!patientUser || !carerUser) return;

    // Doctor profile rows (the legacy seeders created doctor users without profiles).
    for (const d of doctors) {
      const [has] = await q('SELECT id FROM doctors WHERE user_id = :id', { id: d.id });
      if (!has) {
        await queryInterface.bulkInsert('doctors', [{
          user_id: d.id, name: d.email.startsWith('sarah') ? 'Dr. Sarah Malik' : 'Dr. James Reid',
          specialization: 'Geriatric medicine', is_locked: false, created_at: new Date(), updated_at: new Date()
        }]);
      }
    }
    const sarahMd = doctors.find(d => d.email === 'sarah.md@vamora.com');
    if (sarahMd) {
      const [a] = await q(`SELECT id FROM doctor_patient_assignments WHERE doctor_user_id = :d AND patient_user_id = :p AND status = 'active'`, { d: sarahMd.id, p: patientUser.id });
      if (!a) await queryInterface.bulkInsert('doctor_patient_assignments', [{ doctor_user_id: sarahMd.id, patient_user_id: patientUser.id, basis: 'demo_seed', created_at: new Date(), updated_at: new Date() }]);
    }

    const [grant] = await q(`SELECT id FROM access_grants WHERE grantee_user_id = :c AND patient_user_id = :p AND status IN ('active','pending')`, { c: carerUser.id, p: patientUser.id });
    if (!grant) {
      await queryInterface.sequelize.query(
        `INSERT INTO access_grants (patient_user_id, grantee_user_id, permissions, status, basis, relationship_label, needs_review, decided_at, created_at, updated_at)
         VALUES (:p, :c, CAST(:perms AS JSONB), 'active', 'patient_consent', 'daughter', false, NOW(), NOW(), NOW())`,
        { replacements: { p: patientUser.id, c: carerUser.id, perms: JSON.stringify(['memories.view', 'memories.upload', 'mood.view', 'clinical.view', 'observations.view', 'observations.create', 'alerts.receive']) } });
      const [pat] = await q('SELECT id FROM patients WHERE user_id = :p', { p: patientUser.id });
      const [cg] = await q('SELECT id FROM caregivers WHERE user_id = :c', { c: carerUser.id });
      if (pat && cg) {
        await queryInterface.sequelize.query(
          `INSERT INTO patient_caregiver_relationships (patient_id, caregiver_id, created_at, updated_at)
           SELECT :pid, :cid, NOW(), NOW() WHERE NOT EXISTS (SELECT 1 FROM patient_caregiver_relationships WHERE patient_id = :pid AND caregiver_id = :cid)`,
          { replacements: { pid: pat.id, cid: cg.id } });
      }
    }

    const [{ n }] = await q('SELECT COUNT(*)::int AS n FROM memory_items WHERE patient_user_id = :p', { p: patientUser.id });
    if (n === 0) {
      const now = new Date();
      const item = (type, title, content, extra = {}) => ({
        id: require('crypto').randomUUID(), patient_user_id: patientUser.id, type, title, content,
        people: JSON.stringify(extra.people || []), place: extra.place || null, event_date: extra.eventDate || null,
        routine_time: extra.routineTime || null, created_by_user_id: extra.by || patientUser.id,
        patient_confirmed: extra.confirmed !== false, created_at: now, updated_at: now
      });
      await queryInterface.bulkInsert('memory_items', [
        item('person', 'Amna', 'Your daughter. She visits on Sundays and helps you with shopping.', { people: ['Amna'] }),
        item('person', 'David', 'Your husband. You were married for 45 years.', { people: ['David'] }),
        item('place', 'The rose garden', 'The garden behind your house where you grew roses.', { place: 'Home' }),
        item('event', 'Our wedding', 'You married David in a small church. It rained in the morning.', { people: ['David'], eventDate: '1968-06-15' }),
        item('routine', 'Morning tea', 'A cup of tea with milk after you wake up.', { routineTime: '08:00' }),
        item('routine', 'Evening walk', 'A short walk around the garden with Amna.', { routineTime: '18:00', people: ['Amna'], by: carerUser.id, confirmed: false }),
        item('written', 'Where my glasses are', 'On the bedside table, next to the lamp.')
      ]);
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`DELETE FROM memory_items WHERE patient_user_id IN (SELECT id FROM users WHERE email = 'sarah.patient@vamora.com')`);
  }
};
