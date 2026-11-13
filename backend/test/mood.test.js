'use strict';
const { app, db, request, makePatient, makeCaregiver, makeDoctor, grant, assign, auth } = require('./helpers');

describe('Mood self-report and the camera estimate (A4)', () => {
  let pat, cg, dr;
  beforeAll(async () => {
    pat = await makePatient('Mood Patient');
    cg = await makeCaregiver('Mood Carer');
    dr = await makeDoctor('Mood Doctor');
    await grant(pat, cg, ['mood.view', 'alerts.receive']);
    await assign(dr, pat);
  });

  test('unconfirmed camera output cannot be saved as the patient\'s mood', async () => {
    const res = await request(app).post('/api/v1/moods').set(auth(pat.token)).send({ mood: 'sad', source: 'camera' });
    expect(res.status).toBe(400);
  });

  test('a patient-confirmed camera estimate is saved with the estimate kept separately', async () => {
    const res = await request(app).post('/api/v1/moods').set(auth(pat.token))
      .send({ mood: 'calm', source: 'camera_confirmed', inference: { expression: 'sad', confidence: 61.4, agreed: false } });
    expect(res.status).toBe(200);
    expect(res.body.entry.mood).toBe('calm');
    expect(res.body.entry.inference).toMatchObject({ expression: 'sad', confidence: 61, agreedWithEstimate: false });
  });

  test('invalid moods are rejected', async () => {
    expect((await request(app).post('/api/v1/moods').set(auth(pat.token)).send({ mood: 'ecstatic!!' })).status).toBe(400);
  });

  test('self-reported low mood alerts only caregivers with alerts.receive', async () => {
    const other = await makeCaregiver('No Alerts');
    await grant(pat, other, ['mood.view']);
    await request(app).post('/api/v1/moods').set(auth(pat.token)).send({ mood: 'anxious', source: 'manual' });
    await new Promise(r => setTimeout(r, 200));
    expect(await db.Notification.count({ where: { userId: cg.user.id, type: 'mood_alert' } })).toBe(1);
    expect(await db.Notification.count({ where: { userId: other.user.id, type: 'mood_alert' } })).toBe(0);
  });

  test('legacy unconfirmed camera rows are excluded from the mood average and alert flag', async () => {
    const p2 = await makePatient('Legacy Camera');
    await assign(dr, p2);
    await db.Mood.create({ patientId: p2.user.id, mood: 'sad', source: 'camera', recordedAt: new Date() });
    const res = await request(app).get(`/api/v1/doctor/patients/${p2.patient.id}`).set(auth(dr.token));
    expect(res.body.data.wellnessScore).toBeNull();
    expect(res.body.data.moods[0].selfReported).toBe(false);
  });

  test('B8: a single low MMSE score is shown as a band, never "Declining"', async () => {
    await request(app).post(`/api/v1/doctor/patients/${pat.patient.id}/mmse`).set(auth(dr.token)).send({ score: 15, assessmentDate: '2026-10-01' });
    let res = await request(app).get(`/api/v1/doctor/patients/${pat.patient.id}`).set(auth(dr.token));
    expect(res.body.data.cognitiveStatus).toBe('MMSE 0–17');
    expect(res.body.data.mmseTrend).toBeNull();
    await request(app).post(`/api/v1/doctor/patients/${pat.patient.id}/mmse`).set(auth(dr.token)).send({ score: 11, assessmentDate: '2026-11-01' });
    res = await request(app).get(`/api/v1/doctor/patients/${pat.patient.id}`).set(auth(dr.token));
    expect(res.body.data.mmseTrend).toEqual({ delta: -4, direction: 'lower' });
  });

  test('observation summary is labelled as a non-clinical draft and works without an LLM', async () => {
    await db.CareNote.bulkCreate([
      { patientId: pat.user.id, caregiverId: cg.caregiver.id, note: 'Woke twice at night.', category: 'sleep' },
      { patientId: pat.user.id, caregiverId: cg.caregiver.id, note: 'Enjoyed lunch with family.', category: 'eating' },
      { patientId: pat.user.id, caregiverId: cg.caregiver.id, note: 'Retracted', category: 'general', retractedAt: new Date() }
    ]);
    const res = await request(app).get(`/api/v1/doctor/patients/${pat.patient.id}/observation-summary?days=7`).set(auth(dr.token));
    expect(res.status).toBe(200);
    expect(res.body.data.digest.observationCount).toBe(2); // retracted notes excluded
    expect(res.body.data.digest.byCategory).toEqual({ sleep: 1, eating: 1 });
    expect(res.body.data.label).toMatch(/Not a clinical assessment/);
    expect(res.body.data.narrativeStatus).toBe('no_llm_configured');
  });

  test('observation narrative citing unknown notes or using diagnostic language is rejected', async () => {
    const llm = require('../src/ai/llm');
    const summary = require('../src/ai/observationSummary');
    process.env.GROQ_API_KEY = 'test';
    const notes = [{ id: 'a', note: 'Woke twice', category: 'sleep', createdAt: new Date() }];
    const fake = (content) => llm._setClient({ chat: { completions: { create: async () => ({ choices: [{ message: { content } }] }) } } });
    fake(JSON.stringify({ bullets: ['Sleep was disrupted [N1]'] }));
    expect((await summary.summarize(notes, [])).narrativeStatus).toBe('ok');
    fake(JSON.stringify({ bullets: ['Signs of cognitive decline [N1]'] }));
    expect((await summary.summarize(notes, [])).narrativeStatus).toBe('rejected_by_checks');
    fake(JSON.stringify({ bullets: ['Sleep was disrupted [N7]'] }));
    expect((await summary.summarize(notes, [])).narrativeStatus).toBe('rejected_by_checks');
    process.env.GROQ_API_KEY = ''; llm._setClient(null);
  });
});
