'use strict';
/**
 * Test factories. Users are created directly in the database (fast) and then
 * signed in through the real /auth/login endpoint to obtain real tokens.
 * All data is synthetic.
 */
const request = require('supertest');
const app = require('../app');
const db = require('../models');

let seq = 0;
const uniq = (p) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}@test.vamora`;
const PASSWORD = 'Testpass123';

async function login(email, password = PASSWORD) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.accessToken;
}

async function makePatient(name = 'Test Patient') {
  const email = uniq('patient');
  const user = await db.User.create({ email, password: PASSWORD, role: 'patient' });
  const patient = await db.Patient.create({ userId: user.id, name });
  return { user, patient, email, token: await login(email) };
}

async function makeCaregiver(name = 'Test Caregiver') {
  const email = uniq('caregiver');
  const user = await db.User.create({ email, password: PASSWORD, role: 'caregiver' });
  const caregiver = await db.Caregiver.create({ userId: user.id, name });
  return { user, caregiver, email, token: await login(email) };
}

async function makeDoctor(name = 'Test Doctor') {
  const email = uniq('doctor');
  const user = await db.User.create({ email, password: PASSWORD, role: 'doctor' });
  const doctor = await db.Doctor.create({ userId: user.id, name });
  return { user, doctor, email, token: await login(email) };
}

async function makeSuperAdmin() {
  const email = uniq('admin');
  const user = await db.User.create({ email, password: PASSWORD, role: 'super_admin' });
  return { user, email, token: await login(email) };
}

async function grant(patient, grantee, permissions, extra = {}) {
  return db.AccessGrant.create({
    patientUserId: patient.user.id, granteeUserId: grantee.user.id, permissions,
    status: 'active', basis: 'test', ...extra
  });
}

async function assign(doctor, patient) {
  return db.DoctorPatientAssignment.create({ doctorUserId: doctor.user.id, patientUserId: patient.user.id });
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

// Minimal valid files (magic bytes) for upload tests.
const PNG_1PX = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7a6a5a10000000049454e44ae426082', 'hex');
const WEBM_HEADER = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(60, 0)]);

module.exports = { app, db, request, uniq, PASSWORD, login, makePatient, makeCaregiver, makeDoctor, makeSuperAdmin, grant, assign, auth, PNG_1PX, WEBM_HEADER };
