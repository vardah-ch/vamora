'use strict';
const { app, db, request, makePatient, makeCaregiver, makeDoctor, grant, assign, auth, PNG_1PX, WEBM_HEADER } = require('./helpers');

describe('Consent, autonomy and transparency', () => {
  let pat, cg, son, dr;
  beforeAll(async () => {
    pat = await makePatient('Nasreen Akhtar');
    cg = await makeCaregiver('Daughter Hina');
    son = await makeCaregiver('Son Imran');
    dr = await makeDoctor('Dr Zafar');
    await assign(dr, pat);
  });

  test('patient approves a pending request with fewer permissions than requested', async () => {
    await request(app).post('/api/v1/caregiver/patients/add').set(auth(cg.token)).send({ email: pat.email, relationship: 'daughter' });
    const overview = await request(app).get('/api/v1/privacy/overview').set(auth(pat.token));
    expect(overview.status).toBe(200);
    const pending = overview.body.grants.find(g => g.status === 'pending');
    expect(pending.grantee.name).toBe('Daughter Hina');
    const res = await request(app).post(`/api/v1/privacy/grants/${pending.id}/approve`).set(auth(pat.token)).send({ permissions: ['mood.view', 'memories.view', 'consent.manage'] });
    expect(res.status).toBe(200);
    expect(res.body.permissions).toEqual(['memories.view', 'mood.view']); // consent.manage cannot be self-granted this way
    const list = await request(app).get('/api/v1/caregiver/patients').set(auth(cg.token));
    expect(list.body[0].grantStatus).toBe('active');
  });

  test('patient can restrict and revoke at any time; caregiver is notified', async () => {
    const g = await db.AccessGrant.findOne({ where: { granteeUserId: cg.user.id, patientUserId: pat.user.id, status: 'active' } });
    const r = await request(app).put(`/api/v1/privacy/grants/${g.id}/permissions`).set(auth(pat.token)).send({ permissions: ['mood.view'] });
    expect(r.body.permissions).toEqual(['mood.view']);
    expect((await request(app).get(`/api/v1/caregiver/patients/${pat.patient.id}/photos`).set(auth(cg.token))).status).toBe(403);
    const n = await db.Notification.findOne({ where: { userId: cg.user.id, type: 'access_changed' } });
    expect(n).not.toBeNull();
  });

  test('transparency: the patient sees who accessed their information, without content', async () => {
    await request(app).get(`/api/v1/caregiver/patients/${pat.patient.id}`).set(auth(cg.token));
    const act = await request(app).get('/api/v1/privacy/activity').set(auth(pat.token));
    expect(act.status).toBe(200);
    const view = act.body.find(e => e.action === 'patient.view' && e.who === 'Daughter Hina');
    expect(view.description).toBe('looked at your care summary');
  });

  test('caregivers cannot use the privacy API for a patient unless they are the recorded representative', async () => {
    expect((await request(app).get(`/api/v1/privacy/overview?patientId=${pat.patient.id}`).set(auth(cg.token))).status).toBe(403);
  });

  test('representative mode: recorded by a clinician with a basis; patient keeps the right to restrict', async () => {
    // Representative must be on the care team.
    await grant(pat, son, ['mood.view']);
    const bad = await request(app).put(`/api/v1/doctor/patients/${pat.patient.id}/consent-mode`).set(auth(dr.token)).send({ mode: 'representative', representativeEmail: son.email, basis: 'short' });
    expect(bad.status).toBe(400);
    const ok = await request(app).put(`/api/v1/doctor/patients/${pat.patient.id}/consent-mode`).set(auth(dr.token))
      .send({ mode: 'representative', representativeEmail: son.email, basis: 'Lasting power of attorney (health), ref LPA-123, seen in clinic 2026-11-10' });
    expect(ok.status).toBe(200);

    // Representative can now manage sharing on the patient's behalf.
    const repView = await request(app).get(`/api/v1/privacy/overview?patientId=${pat.patient.id}`).set(auth(son.token));
    expect(repView.status).toBe(200);
    expect(repView.body.authority).toBe('full');

    // Patient's authority becomes restrict-only: cannot expand, can restrict.
    const patView = await request(app).get('/api/v1/privacy/overview').set(auth(pat.token));
    expect(patView.body.authority).toBe('restrict');
    const g = await db.AccessGrant.findOne({ where: { granteeUserId: cg.user.id, patientUserId: pat.user.id, status: 'active' } });
    expect((await request(app).put(`/api/v1/privacy/grants/${g.id}/permissions`).set(auth(pat.token)).send({ permissions: ['mood.view', 'memories.view'] })).status).toBe(403);
    expect((await request(app).put(`/api/v1/privacy/grants/${g.id}/permissions`).set(auth(pat.token)).send({ permissions: [] })).status).toBe(200);
  });

  test('a patient revoking their representative alerts the clinician for review', async () => {
    const g = await db.AccessGrant.findOne({ where: { granteeUserId: son.user.id, patientUserId: pat.user.id, status: 'active' } });
    expect((await request(app).post(`/api/v1/privacy/grants/${g.id}/revoke`).set(auth(pat.token))).status).toBe(200);
    const n = await db.Notification.findOne({ where: { userId: dr.user.id, type: 'access_changed' } });
    expect(n.message).toMatch(/representative/);
  });

  test('clinician-linked caregivers get care-coordination access only, flagged for patient review', async () => {
    const p2 = await makePatient('Clinic Patient');
    const c2 = await makeCaregiver('Linked Carer');
    await assign(dr, p2);
    const res = await request(app).post('/api/v1/doctor/team/caregivers/link').set(auth(dr.token)).send({ email: c2.email, patientId: p2.patient.id });
    expect(res.status).toBe(200);
    const g = await db.AccessGrant.findOne({ where: { granteeUserId: c2.user.id, patientUserId: p2.user.id } });
    expect(g.status).toBe('active');
    expect(g.needsReview).toBe(true);
    expect(g.permissions).not.toContain('memories.view');
    expect(g.permissions).not.toContain('voice.view');
    const n = await db.Notification.findOne({ where: { userId: p2.user.id, type: 'care_team_changed' } });
    expect(n).not.toBeNull();
  });

  test('B6: linking a second caregiver does not remove the first', async () => {
    const p3 = await makePatient('Two Carers');
    const a = await makeCaregiver('First'); const b = await makeCaregiver('Second');
    await assign(dr, p3);
    await request(app).post('/api/v1/doctor/team/caregivers/link').set(auth(dr.token)).send({ email: a.email, patientId: p3.patient.id });
    await request(app).post('/api/v1/doctor/team/caregivers/link').set(auth(dr.token)).send({ email: b.email, patientId: p3.patient.id });
    expect(await db.AccessGrant.count({ where: { patientUserId: p3.user.id, status: 'active' } })).toBe(2);
  });

  test('preferences validate input and persist', async () => {
    expect((await request(app).put('/api/v1/privacy/preferences').set(auth(pat.token)).send({ textSize: 'huge' })).status).toBe(400);
    const r = await request(app).put('/api/v1/privacy/preferences').set(auth(pat.token)).send({ textSize: 'large', moodCameraOptIn: true, language: 'ur' });
    expect(r.body).toMatchObject({ textSize: 'large', moodCameraOptIn: true, language: 'ur' });
  });
});

describe('Family-misuse controls on memories', () => {
  let pat, helper, other;
  beforeAll(async () => {
    pat = await makePatient('Rukhsana Bibi');
    helper = await makeCaregiver('Nephew Ali');
    other = await makeCaregiver('Cousin Sara');
    await grant(pat, helper, ['memories.upload', 'voice.upload']);
    await grant(pat, other, ['memories.view', 'memories.upload']);
  });

  test('caregiver-added memories are marked unconfirmed and attributed', async () => {
    const res = await request(app).post('/api/v1/memories').set(auth(helper.token))
      .send({ patientId: pat.patient.id, type: 'person', title: 'Uncle Javed', content: 'Your brother who lives in Karachi.', people: ['Javed'] });
    expect(res.status).toBe(201);
    expect(res.body.patientConfirmed).toBe(false);
    expect(res.body.createdByUserId).toBe(helper.user.id);
    const confirm = await request(app).post(`/api/v1/memories/${res.body.id}/confirm`).set(auth(pat.token));
    expect(confirm.body.patientConfirmed).toBe(true);
    expect((await request(app).post(`/api/v1/memories/${res.body.id}/confirm`).set(auth(helper.token))).status).toBe(403);
  });

  test('uploader without memories.view sees only their own uploads', async () => {
    await request(app).post('/api/v1/memories').set(auth(pat.token)).send({ type: 'written', title: 'My private diary note', content: 'Only for me' });
    const list = await request(app).get(`/api/v1/memories?patientId=${pat.patient.id}`).set(auth(helper.token));
    expect(list.status).toBe(200);
    expect(list.body.every(m => m.createdByUserId === helper.user.id)).toBe(true);
  });

  test('another caregiver cannot delete memories they did not add; patient is notified of removals and can restore', async () => {
    const mine = await request(app).post('/api/v1/memories').set(auth(pat.token)).send({ type: 'event', title: 'Hajj 2005', eventDate: '2005-01-20' });
    expect((await request(app).delete(`/api/v1/memories/${mine.body.id}`).set(auth(other.token))).status).toBe(403);
    const helperItem = await request(app).post('/api/v1/memories').set(auth(other.token)).send({ patientId: pat.patient.id, type: 'place', title: 'Old house in Gujrat' });
    expect((await request(app).delete(`/api/v1/memories/${helperItem.body.id}`).set(auth(other.token))).status).toBe(200);
    const n = await db.Notification.findOne({ where: { userId: pat.user.id, type: 'memory_deleted' } });
    expect(n.message).toMatch(/Cousin Sara removed/);
    expect((await request(app).post(`/api/v1/memories/${helperItem.body.id}/restore`).set(auth(pat.token))).status).toBe(200);
    expect((await db.MemoryItem.findByPk(helperItem.body.id)).deletedAt).toBeNull();
  });

  test('photo removal is soft and restorable by the patient', async () => {
    const up = await request(app).post('/api/v1/photos').set(auth(pat.token)).field('caption', 'Garden').attach('photo', PNG_1PX, { filename: 'g.png', contentType: 'image/png' });
    const id = up.body.photo.id;
    await request(app).delete(`/api/v1/photos/${id}`).set(auth(pat.token));
    const removed = await request(app).get('/api/v1/photos/removed').set(auth(pat.token));
    expect(removed.body.map(p => p.id)).toContain(id);
    await request(app).post(`/api/v1/photos/${id}/restore`).set(auth(pat.token));
    const list = await request(app).get('/api/v1/photos').set(auth(pat.token));
    expect(list.body.map(p => p.id)).toContain(id);
  });

  test('voice notes: uploader can add, viewers need voice.view to hear them', async () => {
    const up = await request(app).post('/api/v1/photos').set(auth(pat.token)).field('caption', 'Wedding').attach('photo', PNG_1PX, { filename: 'w.png', contentType: 'image/png' });
    const id = up.body.photo.id;
    const v = await request(app).post(`/api/v1/photos/${id}/voice`).set(auth(helper.token)).attach('voice', WEBM_HEADER, { filename: 'v.webm', contentType: 'audio/webm' });
    expect(v.status).toBe(200);
    // Cousin has memories.view but not voice.view → sees the photo but no voice URL.
    const list = await request(app).get(`/api/v1/caregiver/patients/${pat.patient.id}/photos`).set(auth(other.token));
    const p = list.body.find(x => x.id === id);
    expect(p.hasVoiceNote).toBe(true);
    expect(p.voiceUrl).toBeNull();
    // Patient hears it.
    const own = await request(app).get('/api/v1/photos').set(auth(pat.token));
    const ownP = own.body.find(x => x.id === id);
    expect((await request(app).get(ownP.voiceUrl)).status).toBe(200);
  });
});
