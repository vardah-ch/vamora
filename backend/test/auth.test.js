'use strict';
const jwt = require('jsonwebtoken');
const { app, db, request, uniq, PASSWORD, login, makeCaregiver, makeDoctor, makeSuperAdmin, auth } = require('./helpers');

describe('Authentication & account security', () => {
  test('S1: public registration cannot create doctor, admin or super_admin accounts', async () => {
    const attempted = [];
    for (const role of ['doctor', 'admin', 'super_admin']) {
      const email = uniq(`mallory-${role}`);
      attempted.push(email);
      const res = await request(app).post('/api/v1/auth/register')
        .send({ email, password: 'Password123', name: 'Mallory', role });
      expect([400, 403]).toContain(res.status);
    }
    expect(await db.User.count({ where: { email: attempted } })).toBe(0);
  });

  test('patients and caregivers can self-register; password policy enforced', async () => {
    const weak = await request(app).post('/api/v1/auth/register').send({ email: uniq('p'), password: 'abc12', name: 'Pat' });
    expect(weak.status).toBe(400);
    const ok = await request(app).post('/api/v1/auth/register').send({ email: uniq('p'), password: 'Goodpass123', name: 'Pat', role: 'patient' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.user.role).toBe('patient');
    expect(ok.body.data.user.password).toBeUndefined();
  });

  test('self-registered caregiver has access to no patient', async () => {
    const reg = await request(app).post('/api/v1/auth/register').send({ email: uniq('c'), password: 'Goodpass123', name: 'Carl', role: 'caregiver' });
    const res = await request(app).get('/api/v1/caregiver/patients').set(auth(reg.body.data.accessToken));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('login errors are uniform for unknown email and wrong password', async () => {
    const cg = await makeCaregiver();
    const a = await request(app).post('/api/v1/auth/login').send({ email: cg.email, password: 'Wrongpass999' });
    const b = await request(app).post('/api/v1/auth/login').send({ email: uniq('nobody'), password: 'Wrongpass999' });
    expect(a.status).toBe(401); expect(b.status).toBe(401);
    expect(a.body.message).toBe(b.body.message);
  });

  test('B3: locked doctors cannot log in and existing sessions end immediately', async () => {
    const doc = await makeDoctor();
    const admin = await makeSuperAdmin();
    const lock = await request(app).patch(`/api/v1/super-admin/doctors/${doc.user.id}/lock`).set(auth(admin.token));
    expect(lock.body.isLocked).toBe(true);
    expect((await request(app).get('/api/v1/doctor/patients').set(auth(doc.token))).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send({ email: doc.email, password: PASSWORD })).status).toBe(401);
  });

  test('S7: logout revokes access and refresh tokens server-side', async () => {
    const cg = await makeCaregiver();
    const loginRes = await request(app).post('/api/v1/auth/login').send({ email: cg.email, password: PASSWORD });
    const { accessToken, refreshToken } = loginRes.body.data;
    expect((await request(app).post('/api/v1/auth/logout').set(auth(accessToken))).status).toBe(200);
    expect((await request(app).get('/api/v1/auth/me').set(auth(accessToken))).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken })).status).toBe(401);
  });

  test('refresh token cannot be used as an access token; forged tokens rejected', async () => {
    const cg = await makeCaregiver();
    const { refreshToken } = (await request(app).post('/api/v1/auth/login').send({ email: cg.email, password: PASSWORD })).body.data;
    expect((await request(app).get('/api/v1/auth/me').set(auth(refreshToken))).status).toBe(401);
    const forged = jwt.sign({ id: cg.user.id, role: 'super_admin', typ: 'access', tv: 0 }, 'your_super_secret_jwt_key', { issuer: 'vamora-api' });
    expect((await request(app).get('/api/v1/auth/me').set(auth(forged))).status).toBe(401);
  });

  test('S8: password reset never returns the token and stores only a hash', async () => {
    const cg = await makeCaregiver();
    const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: cg.email });
    expect(res.status).toBe(200);
    expect(res.body.resetToken).toBeUndefined();
    const row = await db.PasswordReset.findOne({ where: { email: cg.email }, order: [['id', 'DESC']] });
    expect(row.token).toMatch(/^[0-9a-f]{64}$/);
  });

  test('S9: login is rate limited per account', async () => {
    const cg = await makeCaregiver();
    let last;
    for (let i = 0; i < 11; i++) last = await request(app).post('/api/v1/auth/login').send({ email: cg.email, password: 'Wrongpass999' });
    expect(last.status).toBe(429);
  });

  test('S10: server errors do not leak internal messages', async () => {
    const res = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(/stack|Unexpected token|at /);
  });

  test('login attempts are written to the audit log without passwords', async () => {
    const cg = await makeCaregiver();
    await login(cg.email);
    const ev = await db.AuditEvent.findOne({ where: { actorUserId: cg.user.id, action: 'auth.login', outcome: 'allowed' } });
    expect(ev).not.toBeNull();
    expect(JSON.stringify(ev.toJSON())).not.toContain(PASSWORD);
  });

  test('audit log is append-only at the database level', async () => {
    const ev = await db.AuditEvent.findOne();
    await expect(db.sequelize.query(`UPDATE audit_events SET action = 'tampered' WHERE id = ${ev.id}`)).rejects.toThrow(/append-only/);
    await expect(db.sequelize.query(`DELETE FROM audit_events WHERE id = ${ev.id}`)).rejects.toThrow(/append-only/);
  });

  test('users cannot read another user\'s profile, even as admin role', async () => {
    const a = await makeCaregiver();
    const b = await makeCaregiver();
    expect((await request(app).get(`/api/v1/users/${b.user.id}`).set(auth(a.token))).status).toBe(403);
    const admin = await makeSuperAdmin();
    expect((await request(app).get(`/api/v1/users/${b.user.id}`).set(auth(admin.token))).status).toBe(403);
  });
});
