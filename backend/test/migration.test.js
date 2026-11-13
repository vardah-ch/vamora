'use strict';
/**
 * Proves the new migrations are NON-DESTRUCTIVE on a database that holds data
 * written by the ORIGINAL code (baseline fce8614):
 *   1. migrate a fresh database only up to the last baseline migration;
 *   2. insert data exactly as the baseline code wrote it (including care notes
 *      whose patient_id holds a users.id – audit bug B1);
 *   3. apply the new migrations;
 *   4. verify every row survived and legacy relationships became grants.
 */
const path = require('path');
const { execSync } = require('child_process');
const { Sequelize } = require('sequelize');

const DB = 'vamora_migration_test';
const env = { ...process.env, DB_NAME_TEST: DB };
const cwd = path.join(__dirname, '..');
const run = (cmd) => execSync(cmd, { cwd, env, stdio: 'pipe' }).toString();

describe('Migrations preserve legacy data', () => {
  let sq;
  beforeAll(() => {
    sq = new Sequelize(DB, process.env.DB_USER, process.env.DB_PASSWORD, { host: process.env.DB_HOST, port: process.env.DB_PORT, dialect: 'postgres', logging: false });
  });
  afterAll(() => sq.close());

  test('baseline data survives and is upgraded', async () => {
    run('npx sequelize-cli db:migrate --to 20260510120000-create-notifications.js');
    const q = (sql) => sq.query(sql, { type: Sequelize.QueryTypes.SELECT });

    // Legacy rows. Users get ids 1..4; the patient row is id 1 but user id 3,
    // so care notes holding users.id=3 would have hit the wrong FK target.
    await sq.query(`INSERT INTO users (email,password,role,created_at,updated_at) VALUES
      ('dummy1@x.y','h','caregiver',NOW(),NOW()), ('doc@x.y','h','doctor',NOW(),NOW()),
      ('pat@x.y','h','patient',NOW(),NOW()), ('cg@x.y','h','caregiver',NOW(),NOW())`);
    await sq.query(`INSERT INTO patients (user_id,name,created_by_doctor_id,created_at,updated_at) VALUES (3,'Legacy Patient',2,NOW(),NOW())`);
    await sq.query(`INSERT INTO patients (user_id,name,created_at,updated_at) VALUES (1,'Placeholder',NOW(),NOW())`); // makes patients.id=2 exist
    await sq.query(`INSERT INTO caregivers (user_id,name,doctor_id,created_at,updated_at) VALUES (4,'Legacy Carer',2,NOW(),NOW())`);
    await sq.query(`INSERT INTO patient_caregiver_relationships (patient_id,caregiver_id,created_at,updated_at) VALUES (1,1,NOW(),NOW())`);
    await sq.query(`INSERT INTO "Photos" (id,"patientId",filename,caption,"takenAt","createdAt","updatedAt",category) VALUES (gen_random_uuid(),3,'/uploads/photos/a.jpg','Old photo',NOW(),NOW(),NOW(),'family')`);
    await sq.query(`INSERT INTO "Moods" (id,"patientId",mood,source,"recordedAt","createdAt","updatedAt") VALUES (gen_random_uuid(),3,'sad','camera',NOW(),NOW(),NOW())`);
    // Baseline wrote users.id into care_notes.patient_id. With FK→patients.id this only
    // succeeds when that number happens to be a patients.id (here 2 = the WRONG patient).
    await sq.query(`INSERT INTO care_notes (id,patient_id,caregiver_id,note,created_at,updated_at) VALUES (gen_random_uuid(),2,1,'note',NOW(),NOW())`);
    const before = {
      photos: (await q('SELECT COUNT(*)::int n FROM "Photos"'))[0].n,
      moods: (await q('SELECT COUNT(*)::int n FROM "Moods"'))[0].n,
      notes: (await q('SELECT COUNT(*)::int n FROM care_notes'))[0].n
    };

    // The B1 bug in the baseline schema: a note for user 3 cannot be inserted at all.
    await expect(sq.query(`INSERT INTO care_notes (id,patient_id,caregiver_id,note,created_at,updated_at) VALUES (gen_random_uuid(),3,1,'n',NOW(),NOW())`)).rejects.toThrow(/foreign key/);

    run('npx sequelize-cli db:migrate');

    expect((await q('SELECT COUNT(*)::int n FROM "Photos"'))[0].n).toBe(before.photos);
    expect((await q('SELECT COUNT(*)::int n FROM "Moods"'))[0].n).toBe(before.moods);
    expect((await q('SELECT COUNT(*)::int n FROM care_notes'))[0].n).toBe(before.notes);

    // After the fix, notes keyed by users.id are accepted.
    await sq.query(`INSERT INTO care_notes (id,patient_id,caregiver_id,note,created_at,updated_at) VALUES (gen_random_uuid(),3,1,'n',NOW(),NOW())`);

    const grants = await q('SELECT patient_user_id, grantee_user_id, status, basis, needs_review, permissions FROM access_grants');
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ patient_user_id: 3, grantee_user_id: 4, status: 'active', basis: 'legacy_assignment', needs_review: true });
    expect(grants[0].permissions).toContain('memories.view');

    const assignments = await q('SELECT patient_user_id, doctor_user_id FROM doctor_patient_assignments');
    expect(assignments).toEqual([{ patient_user_id: 3, doctor_user_id: 2 }]);

    // Rollback of the newest migration works too (reversibility).
    run('npx sequelize-cli db:migrate:undo');
    run('npx sequelize-cli db:migrate');
  }, 120000);
});
