'use strict';
const express = require('express');
const router = express.Router();
const db = require('../../models');
const { authenticate, requireSuperAdmin } = require('../middlewares/auth');
const audit = require('../services/auditService');
const { badRequest, conflict, notFound, forbidden, parseId, generateTemporaryPassword } = require('../utils/http');

/**
 * Super-admin API. Base: /api/v1/super-admin
 *
 * Administrators manage ACCOUNTS, not patient information (audit S11):
 * they can create, lock and deactivate accounts, assign doctors to patients,
 * and review the access audit trail (metadata only). They cannot read photos,
 * recordings, notes, moods or conversations — accessControl gives the admin
 * roles no patient-data permissions at all.
 */
const guard = [authenticate, requireSuperAdmin];
const isValidEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

const resolveName = (u) => u.patientProfile?.name || u.caregiverProfile?.name || u.doctorProfile?.name || null;
const profileIncludes = () => [
  { model: db.Patient, as: 'patientProfile', attributes: ['name'] },
  { model: db.Caregiver, as: 'caregiverProfile', attributes: ['name', 'isLocked'] },
  { model: db.Doctor, as: 'doctorProfile', attributes: ['name', 'isLocked'] }
];

async function createAccount(req, res, role, makeProfile) {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!name || !email) throw badRequest('name and email are required.');
  if (!isValidEmail(email)) throw badRequest('Invalid email address.');
  if (await db.User.findOne({ where: { email } })) throw conflict('A user with this email already exists.');
  const custom = req.body?.password && String(req.body.password).length >= 8 ? String(req.body.password) : null;
  const password = custom || generateTemporaryPassword();
  const { user, profile } = await db.sequelize.transaction(async (transaction) => {
    const u = await db.User.create({ email, password, role }, { transaction });
    const p = await makeProfile(u, name, transaction);
    return { user: u, profile: p };
  });
  await audit.record(req, { action: 'account.create', resourceType: role, resourceId: user.id, reason: role });
  res.status(201).json({
    message: `${role[0].toUpperCase() + role.slice(1)} created.`,
    user: { id: user.id, email: user.email, role: user.role },
    [role]: { id: profile.id, name: profile.name },
    defaultPassword: custom ? undefined : password
  });
}

router.post('/doctors', ...guard, (req, res) => createAccount(req, res, 'doctor', (u, name, t) =>
  db.Doctor.create({ userId: u.id, name, specialization: req.body.specialization || null, licenseNumber: req.body.licenseNumber || null }, { transaction: t })));

router.post('/caregivers', ...guard, (req, res) => createAccount(req, res, 'caregiver', (u, name, t) =>
  db.Caregiver.create({ userId: u.id, name, phone: req.body.phone || null }, { transaction: t })));

router.post('/patients', ...guard, (req, res) => createAccount(req, res, 'patient', (u, name, t) =>
  db.Patient.create({ userId: u.id, name, dateOfBirth: req.body.dateOfBirth || null }, { transaction: t })));

router.get('/users', ...guard, async (req, res) => {
  const users = await db.User.findAll({ attributes: ['id', 'email', 'role', 'isActive', 'createdAt'], include: profileIncludes(), order: [['createdAt', 'ASC']] });
  res.json(users.map(u => ({
    id: u.id, email: u.email, role: u.role, isActive: u.isActive, name: resolveName(u),
    isLocked: u.doctorProfile?.isLocked ?? u.caregiverProfile?.isLocked ?? null, createdAt: u.createdAt
  })));
});

/** Recent registrations (kept for the existing dashboard "logs" tab). */
router.get('/logs', ...guard, async (req, res) => {
  const entries = await db.User.findAll({ attributes: ['id', 'email', 'role', 'isActive', 'createdAt'], include: profileIncludes(), order: [['createdAt', 'DESC']], limit: 50 });
  res.json(entries.map(u => ({ id: u.id, email: u.email, role: u.role, isActive: u.isActive, name: resolveName(u), createdAt: u.createdAt })));
});

/** Security audit trail: metadata only (no content), for oversight of access. */
router.get('/audit', ...guard, async (req, res) => {
  const where = {};
  if (req.query.outcome && ['allowed', 'denied', 'error'].includes(req.query.outcome)) where.outcome = req.query.outcome;
  if (req.query.action) where.action = String(req.query.action).slice(0, 64);
  const events = await db.AuditEvent.findAll({ where, order: [['occurredAt', 'DESC']], limit: Math.min(Number(req.query.limit) || 100, 500) });
  await audit.record(req, { action: 'audit.view', reason: `${events.length} events` });
  res.json(events);
});

async function toggleLock(req, res, Model, label) {
  const profile = await Model.findOne({ where: { userId: parseId(req.params.id) } });
  if (!profile) throw notFound(`${label} not found.`);
  await profile.update({ isLocked: !profile.isLocked });
  if (profile.isLocked) await db.User.increment('tokenVersion', { where: { id: profile.userId } }); // end sessions now
  await audit.record(req, { action: `account.${profile.isLocked ? 'lock' : 'unlock'}`, resourceType: label.toLowerCase(), resourceId: profile.userId });
  res.json({ message: `${label} ${profile.isLocked ? 'locked' : 'unlocked'} successfully.`, isLocked: profile.isLocked, [`${label.toLowerCase()}Id`]: profile.id });
}

router.patch('/doctors/:id/lock', ...guard, (req, res) => toggleLock(req, res, db.Doctor, 'Doctor'));
router.patch('/caregivers/:id/lock', ...guard, (req, res) => toggleLock(req, res, db.Caregiver, 'Caregiver'));

/**
 * "Delete" deactivates the account and ends all sessions. Patient memories are
 * NOT destroyed by an administrator; permanent erasure must follow a request
 * from the patient or their representative (documented procedure).
 */
router.delete('/users/:id', ...guard, async (req, res) => {
  const user = await db.User.findByPk(parseId(req.params.id));
  if (!user) throw notFound('User not found.');
  if (user.role === 'super_admin') throw forbidden('Cannot deactivate a super admin account.');
  await user.update({ isActive: false, tokenVersion: (user.tokenVersion || 0) + 1 });
  await audit.record(req, { action: 'account.deactivate', resourceType: user.role, resourceId: user.id });
  res.json({ message: 'Account deactivated. Personal data was kept and can only be erased at the person\'s request.' });
});

router.patch('/users/:id/reactivate', ...guard, async (req, res) => {
  const user = await db.User.findByPk(parseId(req.params.id));
  if (!user) throw notFound('User not found.');
  await user.update({ isActive: true });
  await audit.record(req, { action: 'account.reactivate', resourceType: user.role, resourceId: user.id });
  res.json({ message: 'Account reactivated.' });
});

/** Assign a doctor to a patient's care team. Grants the ADMIN nothing. */
router.post('/assignments', ...guard, async (req, res) => {
  const doctor = await db.User.findOne({ where: { email: String(req.body?.doctorEmail || '').toLowerCase(), role: 'doctor' } });
  const patientUser = await db.User.findOne({ where: { email: String(req.body?.patientEmail || '').toLowerCase(), role: 'patient' } });
  if (!doctor || !patientUser) throw badRequest('Both a doctor email and a patient email are required.');
  const [a, created] = await db.DoctorPatientAssignment.findOrCreate({
    where: { doctorUserId: doctor.id, patientUserId: patientUser.id, status: 'active' },
    defaults: { basis: 'admin_assignment', assignedByUserId: req.user.id }
  });
  await audit.record(req, { action: 'assignment.create', resourceType: 'doctor_assignment', resourceId: a.id, patientUserId: patientUser.id });
  res.status(created ? 201 : 200).json({ message: created ? 'Doctor assigned.' : 'Doctor was already assigned.', assignmentId: a.id });
});

module.exports = router;
