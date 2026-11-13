'use strict';
const { app, db, request, makePatient, makeCaregiver, makeDoctor, makeSuperAdmin, grant, assign, auth, PNG_1PX } = require('./helpers');
const ac = require('../src/services/accessControl');

/**
 * Patient isolation & role-based access. Each test corresponds to an audit
 * finding (docs/AUDIT.md §3) that was exploitable in the baseline.
 */
describe('Patient isolation and least privilege', () => {
  let alice, bob, carer, stranger, drA, drB, admin;

  beforeAll(async () => {
    alice = await makePatient('Alice Ahmed');
    bob = await makePatient('Bob Baig');
    carer = await makeCaregiver('Carer Khan');
    stranger = await makeCaregiver('Stranger Shah');
    drA = await makeDoctor('Dr A');
    drB = await makeDoctor('Dr B');
    admin = await makeSuperAdmin();
    await grant(alice, carer, ['mood.view', 'clinical.view', 'observations.create', 'observations.view', 'memories.upload']);
    await assign(drA, alice);
    await db.Mood.create({ patientId: alice.user.id, mood: 'sad', source: 'manual' });
    await db.Medication.create({ patientId: alice.user.id, doctorId: drA.user.id, medicationName: 'Donepezil' });
    await db.Medication.create({ patientId: bob.user.id, doctorId: drA.user.id, medicationName: 'BobSecretMed' });
  });

  test('S3: a caregiver cannot read a patient they are not authorised for by changing the id', async () => {
    for (const path of [`/api/v1/caregiver/patients/${bob.patient.id}`, `/api/v1/caregiver/patients/${bob.patient.id}/medications`, `/api/v1/caregiver/patients/${bob.patient.id}/photos`]) {
      const res = await request(app).get(path).set(auth(carer.token));
      expect(res.status).toBe(403);
      expect(JSON.stringify(res.body)).not.toContain('BobSecretMed');
    }
    const denied = await db.AuditEvent.findOne({ where: { actorUserId: carer.user.id, patientUserId: bob.user.id, outcome: 'denied' } });
    expect(denied).not.toBeNull();
  });

  test('S3: caregiver sees only the sections their grant allows', async () => {
    const res = await request(app).get(`/api/v1/caregiver/patients/${alice.patient.id}`).set(auth(carer.token));
    expect(res.status).toBe(200);
    expect(res.body.medications.map(m => m.medicationName)).toEqual(['Donepezil']);
    expect(res.body.moods).toHaveLength(1);
    expect(res.body.permissions).not.toContain('memories.view');
  });

  test('S3: caregiver cannot write notes for an unauthorised patient', async () => {
    const res = await request(app).post(`/api/v1/caregiver/patients/${bob.patient.id}/notes`).set(auth(carer.token)).send({ note: 'x' });
    expect(res.status).toBe(403);
  });

  test('S4: only the author can retract a care note, and retraction is not deletion', async () => {
    await grant(alice, stranger, ['observations.view']);
    const created = await request(app).post(`/api/v1/caregiver/patients/${alice.patient.id}/notes`).set(auth(carer.token)).send({ note: 'Slept well', category: 'sleep' });
    expect(created.status).toBe(200);
    expect((await request(app).delete(`/api/v1/caregiver/notes/${created.body.id}`).set(auth(stranger.token))).status).toBe(403);
    expect((await request(app).delete(`/api/v1/caregiver/notes/${created.body.id}`).set(auth(carer.token))).status).toBe(200);
    const row = await db.CareNote.findByPk(created.body.id);
    expect(row).not.toBeNull();
    expect(row.retractedAt).not.toBeNull();
    await db.AccessGrant.update({ status: 'revoked' }, { where: { granteeUserId: stranger.user.id } });
  });

  test('S5: adding a patient by email creates a pending request with no data access', async () => {
    const res = await request(app).post('/api/v1/caregiver/patients/add').set(auth(stranger.token)).send({ email: bob.email, relationship: 'nephew' });
    expect(res.status).toBe(200);
    const g = await db.AccessGrant.findOne({ where: { granteeUserId: stranger.user.id, patientUserId: bob.user.id } });
    expect(g.status).toBe('pending');
    expect((await request(app).get(`/api/v1/caregiver/patients/${bob.patient.id}`).set(auth(stranger.token))).status).toBe(403);
    const note = await db.Notification.findOne({ where: { userId: bob.user.id, type: 'access_request' } });
    expect(note).not.toBeNull();
  });

  test('S5: the add-by-email response does not reveal whether an account exists', async () => {
    const a = await request(app).post('/api/v1/caregiver/patients/add').set(auth(stranger.token)).send({ email: 'no-such-person@test.vamora' });
    const b = await request(app).post('/api/v1/caregiver/patients/add').set(auth(stranger.token)).send({ email: alice.email });
    expect(a.body.message).toBe(b.body.message);
  });

  test('S2: doctors only see patients assigned to them', async () => {
    const listA = await request(app).get('/api/v1/doctor/patients').set(auth(drA.token));
    expect(listA.body.data.map(p => p.id)).toEqual([alice.patient.id]);
    const listB = await request(app).get('/api/v1/doctor/patients').set(auth(drB.token));
    expect(listB.body.data).toEqual([]);
    expect((await request(app).get(`/api/v1/doctor/patients/${alice.patient.id}`).set(auth(drB.token))).status).toBe(403);
    expect((await request(app).post(`/api/v1/doctor/patients/${alice.patient.id}/medications`).set(auth(drB.token)).send({ medicationName: 'X' })).status).toBe(403);
  });

  test('S2: a doctor cannot delete a patient account; "remove" only ends their own assignment', async () => {
    const tmp = await makePatient('Temp Patient');
    await assign(drB, tmp);
    expect((await request(app).delete(`/api/v1/doctor/patients/${tmp.patient.id}`).set(auth(drA.token))).status).toBe(403);
    expect((await request(app).delete(`/api/v1/doctor/patients/${tmp.patient.id}`).set(auth(drB.token))).status).toBe(200);
    expect(await db.User.findByPk(tmp.user.id)).not.toBeNull();
    expect(await db.Patient.findByPk(tmp.patient.id)).not.toBeNull();
  });

  test('S4: doctors cannot delete appointments/medications of patients they do not manage', async () => {
    const med = await db.Medication.findOne({ where: { medicationName: 'BobSecretMed' } });
    expect((await request(app).delete(`/api/v1/doctor/medications/${med.id}`).set(auth(drA.token))).status).toBe(403);
    expect(await db.Medication.findByPk(med.id)).not.toBeNull();
  });

  test('doctor assignment does NOT include photos, voice or companion conversations', async () => {
    const access = await ac.getAccess(drA.user, alice.user.id);
    expect(access.permissions.has('clinical.view')).toBe(true);
    for (const p of ['memories.view', 'voice.view', 'ai.history.view']) expect(access.permissions.has(p)).toBe(false);
  });

  test('S11: administrators have no patient-data permissions', async () => {
    const access = await ac.getAccess(admin.user, alice.user.id);
    expect(access.permissions.size).toBe(0);
    expect((await request(app).get(`/api/v1/caregiver/patients/${alice.patient.id}`).set(auth(admin.token))).status).toBe(403);
    expect((await request(app).get(`/api/v1/doctor/patients/${alice.patient.id}`).set(auth(admin.token))).status).toBe(403);
    expect((await request(app).get(`/api/v1/memories?patientId=${alice.patient.id}`).set(auth(admin.token))).status).toBe(403);
  });

  test('S11: admin "delete" deactivates and keeps the patient\'s data', async () => {
    const tmp = await makePatient('Deactivate Me');
    const res = await request(app).delete(`/api/v1/super-admin/users/${tmp.user.id}`).set(auth(admin.token));
    expect(res.status).toBe(200);
    const u = await db.User.findByPk(tmp.user.id);
    expect(u.isActive).toBe(false);
    expect(await db.Patient.findByPk(tmp.patient.id)).not.toBeNull();
  });

  test('role ceilings: grants cannot give a caregiver clinical.manage, or an admin anything', () => {
    expect(ac.sanitizePermissions(['clinical.manage', 'mood.view'], 'caregiver')).toEqual(['mood.view']);
    expect(ac.sanitizePermissions(['mood.view'], 'super_admin')).toEqual([]);
  });

  test('non-numeric / malformed ids are rejected, not passed to SQL', async () => {
    expect((await request(app).get('/api/v1/caregiver/patients/1%20OR%201=1').set(auth(carer.token))).status).toBe(400);
    expect((await request(app).delete('/api/v1/caregiver/notes/not-a-uuid').set(auth(carer.token))).status).toBe(400);
  });

  test('patient-only endpoints reject other roles', async () => {
    expect((await request(app).post('/api/v1/companion/chat').set(auth(carer.token)).send({ message: 'hi' })).status).toBe(403);
    expect((await request(app).post('/api/v1/moods').set(auth(drA.token)).send({ mood: 'happy' })).status).toBe(403);
  });
});

describe('Media access (S6)', () => {
  let pat, cg, outsider, photoUrl;

  beforeAll(async () => {
    pat = await makePatient('Media Patient');
    cg = await makeCaregiver('Media Carer');
    outsider = await makeCaregiver('Outsider');
    const up = await request(app).post('/api/v1/photos').set(auth(pat.token))
      .field('caption', 'Wedding day with Rashid').field('category', 'family')
      .attach('photo', PNG_1PX, { filename: 'wedding.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    photoUrl = up.body.photo.url;
  });

  test('uploads are not publicly reachable under /uploads', async () => {
    const photo = await db.Photo.findOne({ where: { patientId: pat.user.id } });
    expect((await request(app).get(`/uploads/photos/${photo.filename}`)).status).toBe(404);
  });

  test('the owner can fetch their photo through a signed URL', async () => {
    const res = await request(app).get(photoUrl);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(res.headers['cache-control']).toMatch(/private/);
  });

  test('tampered, foreign or expired signed URLs are rejected', async () => {
    const tampered = photoUrl.replace(/u=\d+/, `u=${outsider.user.id}`);
    expect((await request(app).get(tampered)).status).toBe(403);
    const expired = photoUrl.replace(/e=\d+/, 'e=1000');
    expect((await request(app).get(expired)).status).toBe(403);
  });

  test('a caregiver needs memories.view to see the patient\'s photos, and loses it on revocation', async () => {
    expect((await request(app).get(`/api/v1/caregiver/patients/${pat.patient.id}/photos`).set(auth(cg.token))).status).toBe(403);
    const g = await grant(pat, cg, ['memories.view']);
    const list = await request(app).get(`/api/v1/caregiver/patients/${pat.patient.id}/photos`).set(auth(cg.token));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    const url = list.body[0].url;
    expect((await request(app).get(url)).status).toBe(200);
    // Patient revokes → the already-issued URL stops working immediately.
    const rev = await request(app).post(`/api/v1/privacy/grants/${g.id}/revoke`).set(auth(pat.token));
    expect(rev.status).toBe(200);
    expect((await request(app).get(url)).status).toBe(403);
    const ev = await db.AuditEvent.findOne({ where: { actorUserId: cg.user.id, action: 'media.photo.view', outcome: 'allowed' } });
    expect(ev).not.toBeNull();
  });

  test('S12: files whose bytes are not an image are rejected even if labelled image/png', async () => {
    const res = await request(app).post('/api/v1/photos').set(auth(pat.token))
      .field('caption', 'evil').attach('photo', Buffer.from('<svg onload=alert(1)>'), { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
  });

  test('B5: uploading without a file returns 400, not 500', async () => {
    const res = await request(app).post('/api/v1/photos').set(auth(pat.token)).field('caption', 'no file');
    expect(res.status).toBe(400);
  });
});
