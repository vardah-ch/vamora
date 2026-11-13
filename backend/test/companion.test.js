'use strict';
const { app, db, request, makePatient, makeCaregiver, grant, auth } = require('./helpers');
const llm = require('../src/ai/llm');
const companion = require('../src/ai/companion');
const grounding = require('../src/ai/grounding');

/**
 * Companion pipeline tests. No real LLM is called: a scripted fake client
 * returns chosen outputs so that verification and fallback behaviour can be
 * tested deterministically (including deliberately hallucinated replies).
 */
function fakeLLM(outputs) {
  const calls = [];
  llm._setClient({ _fake: true, chat: { completions: { create: async (req) => { calls.push(req); const o = outputs.shift(); if (o instanceof Error) throw o; return { choices: [{ message: { content: o } }], model: 'fake-model' }; } } } });
  return calls;
}

describe('Grounding verifier (unit)', () => {
  const evidence = ['Amna. People: Amna. Your daughter. She lives in Lahore and visits on Sundays.'];
  test('accepts a reply that only uses evidence facts', () => {
    expect(grounding.verifyReply('Amna is your daughter. She visits you on Sunday in the afternoon.', evidence, { patientName: 'Sarah' }).grounded).toBe(true);
  });
  test('flags invented names, places and years', () => {
    const r = grounding.verifyReply('Your son Bilal took you to Karachi in 1998.', evidence, { patientName: 'Sarah' });
    expect(r.grounded).toBe(false);
    expect(r.unsupported).toEqual(expect.arrayContaining(['bilal', 'karachi', '1998']));
  });
  test('detects dosing advice', () => {
    expect(grounding.containsMedicalAdvice('You should take 10 mg tonight.')).toBe(true);
  });
});

describe('Companion API', () => {
  let pat, carer;
  beforeAll(async () => {
    pat = await makePatient('Sarah Johnson');
    carer = await makeCaregiver('Amna Khan');
    await grant(pat, carer, ['alerts.receive']);
    await db.MemoryItem.bulkCreate([
      { patientUserId: pat.user.id, type: 'person', title: 'Amna', content: 'Your daughter. She lives in Lahore and visits on Sundays.', people: ['Amna'] },
      { patientUserId: pat.user.id, type: 'routine', title: 'Evening tea', content: 'Tea with milk on the veranda.', routineTime: '17:00' },
      { patientUserId: pat.user.id, type: 'event', title: 'Wedding anniversary', content: 'Married to Rashid in Gujrat.', people: ['Rashid'], eventDate: '1970-06-15', patientConfirmed: false }
    ]);
  });
  afterEach(() => { process.env.GROQ_API_KEY = ''; llm._setClient(null); });

  test('without an LLM key the companion still works using retrieval only', async () => {
    const res = await request(app).post('/api/v1/companion/chat').set(auth(pat.token)).send({ message: 'Who is my daughter?' });
    expect(res.status).toBe(200);
    expect(res.body.grounding.status).toBe('retrieval_only');
    expect(res.body.reply).toMatch(/Amna/);
    expect(res.body.sources[0].title).toBe('Amna');
  });

  test('abstains honestly when no memory is relevant', async () => {
    const res = await request(app).post('/api/v1/companion/chat').set(auth(pat.token)).send({ message: 'Tell me about my trip to Paris' });
    expect(res.body.grounding.status).toBe('no_relevant_memory');
    expect(res.body.reply).toMatch(/not sure/i);
    expect(res.body.sources).toEqual([]);
  });

  test('grounded LLM reply is accepted and cites retrieved memories; prompt contains only retrieved memories', async () => {
    process.env.GROQ_API_KEY = 'test';
    const calls = fakeLLM([JSON.stringify({ reply: 'Amna is your daughter. She lives in Lahore and visits on Sundays. Would you like to see a photo?', used: ['M1'], confidence: 'high' })]);
    const res = await request(app).post('/api/v1/companion/chat').set(auth(pat.token)).send({ message: 'Who is Amna?' });
    expect(res.body.grounding.status).toBe('grounded');
    expect(res.body.sources.map(s => s.title)).toEqual(['Amna']);
    const system = calls[0].messages[0].content;
    expect(system).toMatch(/Amna/);
    expect(system).not.toMatch(/Evening tea/); // data minimisation: irrelevant memories are not sent
    expect(system).not.toMatch(/Never say you are an AI/);
  });

  test('a hallucinated reply is repaired once, then replaced by an evidence-only reply', async () => {
    process.env.GROQ_API_KEY = 'test';
    const bad = JSON.stringify({ reply: 'Amna and her husband Tariq visited you in Islamabad last May.', used: ['M1'] });
    fakeLLM([bad, bad]);
    const res = await request(app).post('/api/v1/companion/chat').set(auth(pat.token)).send({ message: 'Who is Amna?' });
    expect(res.body.grounding.status).toBe('fallback_after_unsupported_claims');
    expect(res.body.grounding.unsupported).toEqual(expect.arrayContaining(['tariq', 'islamabad']));
    expect(res.body.reply).not.toMatch(/Tariq|Islamabad/);
    expect(res.body.reply).toMatch(/Amna/);
  });

  test('a repaired reply is accepted on the second attempt', async () => {
    process.env.GROQ_API_KEY = 'test';
    fakeLLM([
      JSON.stringify({ reply: 'Amna visited with Tariq.', used: ['M1'] }),
      JSON.stringify({ reply: 'Amna is your daughter and she visits on Sundays.', used: ['M1'] })
    ]);
    const res = await request(app).post('/api/v1/companion/chat').set(auth(pat.token)).send({ message: 'Who is Amna?' });
    expect(res.body.grounding.status).toBe('grounded');
    expect(res.body.grounding.attempts).toBe(2);
  });

  test('LLM outage falls back gracefully (no 500)', async () => {
    process.env.GROQ_API_KEY = 'test';
    fakeLLM([Object.assign(new Error('boom'), { status: 503 }), Object.assign(new Error('boom'), { status: 503 })]);
    const res = await request(app).post('/api/v1/companion/chat').set(auth(pat.token)).send({ message: 'Who is Amna?' });
    expect(res.status).toBe(200);
    expect(res.body.grounding.status).toMatch(/fallback/);
  });

  test('unconfirmed caregiver-added memories are disclosed as such', async () => {
    const res = await request(app).post('/api/v1/companion/chat').set(auth(pat.token)).send({ message: 'When was my wedding anniversary?' });
    expect(res.body.reply).toMatch(/caregiver added/);
  });

  test('urgent messages bypass the LLM and alert permitted caregivers', async () => {
    process.env.GROQ_API_KEY = 'test';
    const calls = fakeLLM([]);
    const res = await request(app).post('/api/v1/companion/chat').set(auth(pat.token)).send({ message: 'I fell and I cannot get up' });
    expect(res.body.grounding.status).toBe('safety:urgent');
    expect(calls).toHaveLength(0);
    expect(await db.Notification.count({ where: { userId: carer.user.id, type: 'help_request' } })).toBe(1);
  });

  test('"help me remember" is NOT treated as an emergency', async () => {
    const res = await request(app).post('/api/v1/companion/chat').set(auth(pat.token)).send({ message: 'help me remember Amna' });
    expect(res.body.grounding.status).not.toBe('safety:urgent');
  });

  test('medication questions are redirected; identity questions answered honestly', async () => {
    const med = await request(app).post('/api/v1/companion/chat').set(auth(pat.token)).send({ message: 'How many pills should I take?' });
    expect(med.body.grounding.status).toBe('safety:medical');
    const who = await request(app).post('/api/v1/companion/chat').set(auth(pat.token)).send({ message: 'Are you a real person?' });
    expect(who.body.reply).toMatch(/not a person/);
  });

  test('chat history is stored with grounding metadata and can be cleared by the patient', async () => {
    const hist = await request(app).get('/api/v1/companion/history').set(auth(pat.token));
    expect(hist.body.some(m => m.groundingStatus)).toBe(true);
    const del = await request(app).delete('/api/v1/companion/history').set(auth(pat.token));
    expect(del.body.deleted).toBeGreaterThan(0);
  });

  test('routine questions use the current time of day (unit)', async () => {
    const at5pm = new Date(); at5pm.setHours(17, 10, 0, 0);
    const out = await companion.respond({ patientUserId: pat.user.id, patientName: 'Sarah', message: 'What should I do now?', now: at5pm });
    expect(out.sources[0].title).toBe('Evening tea');
  });
});
