'use strict';
const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const db = require('../../models');
const { authenticate, authorize } = require('../middlewares/auth');
const ac = require('../services/accessControl');
const audit = require('../services/auditService');
const careTeam = require('../services/careTeam');
const lib = require('../services/memoryLibrary');
const NotificationService = require('../services/NotificationService');
const { parseId, badRequest, forbidden, notFound } = require('../utils/http');

/**
 * Patient privacy & consent API. Base: /api/v1/privacy
 *
 * Used by the patient themself, or by a representative recorded by a
 * clinician (?patientId=<patients.id>). Core rule:
 *   RESTRICTING or REVOKING access is always allowed for the patient;
 *   GRANTING or EXPANDING access needs decision authority ('full').
 * In 'representative' mode the patient keeps 'restrict' authority, so a
 * person can always reduce who sees their information.
 */

async function subject(req) {
  if (req.user.role === 'patient') {
    const patient = await db.Patient.findOne({ where: { userId: req.user.id } });
    if (!patient) throw notFound('Patient profile not found.');
    return patient;
  }
  if (req.query.patientId === undefined && req.body?.patientId === undefined) throw badRequest('patientId is required.');
  return ac.resolvePatientById(parseId(req.query.patientId ?? req.body.patientId, 'patientId'));
}

async function authorityFor(req, patient) {
  const level = await ac.sharingAuthority(req.user, patient);
  if (!level) {
    await audit.record(req, { action: 'privacy.view', patientUserId: patient.userId, outcome: 'denied', reason: 'no sharing authority' });
    throw forbidden('Only the person, or their recorded representative, can manage sharing.');
  }
  return level;
}

async function loadGrant(req, patient) {
  const grant = await db.AccessGrant.findByPk(parseId(req.params.id, 'grant id'));
  if (!grant || grant.patientUserId !== patient.userId) throw notFound('Sharing entry not found.');
  return grant;
}

const ACTION_LABELS = {
  'patient.view': 'looked at your care summary',
  'photos.list': 'looked at your photo list',
  'memories.list': 'looked at your written memories',
  'media.photo.view': 'opened a photo',
  'media.voice.view': 'played a voice recording',
  'photo.upload': 'added a photo',
  'voice.upload': 'added a voice recording',
  'photo.delete': 'removed a photo',
  'photo.restore': 'restored a photo',
  'memory.create': 'added a memory',
  'memory.update': 'changed a memory',
  'memory.delete': 'removed a memory',
  'memory.restore': 'restored a memory',
  'observation.create': 'wrote a care note',
  'observation.retract': 'withdrew a care note',
  'observations.summary': 'viewed a summary of care notes',
  'medications.view': 'looked at your medicines',
  'appointment.create': 'added an appointment',
  'medication.create': 'added a medicine',
  'mmse.create': 'recorded a memory-test score',
  'grant.request': 'asked to join your care team',
  'grant.approve': 'approved sharing',
  'grant.decline': 'declined a request',
  'grant.update': 'changed what someone can see',
  'grant.revoke': 'stopped sharing with someone',
  'care_team.add': 'added someone to your care team',
  'consent_mode.update': 'changed how sharing decisions are made',
  'companion.help_request': 'alerted your helpers that you asked for help'
};

async function grantView(g) {
  const name = await lib.displayName(g.granteeUserId);
  const grantee = await db.User.findByPk(g.granteeUserId, { attributes: ['role'] });
  return {
    id: g.id, status: g.status, basis: g.basis, needsReview: g.needsReview,
    grantee: { userId: g.granteeUserId, name, role: grantee?.role, relationship: g.relationshipLabel },
    permissions: ac.sanitizePermissions(g.permissions, grantee?.role),
    createdAt: g.createdAt, decidedAt: g.decidedAt
  };
}

// ── Overview ──────────────────────────────────────────────────────────────
router.get('/overview', authenticate, async (req, res) => {
  const patient = await subject(req);
  const authority = await authorityFor(req, patient);
  const [grants, assignments] = await Promise.all([
    db.AccessGrant.findAll({ where: { patientUserId: patient.userId, status: { [Op.in]: ['pending', 'active'] } }, order: [['status', 'DESC'], ['createdAt', 'ASC']] }),
    db.DoctorPatientAssignment.findAll({ where: { patientUserId: patient.userId, status: 'active' } })
  ]);
  const clinicians = await Promise.all(assignments.map(async a => ({ userId: a.doctorUserId, name: await lib.displayName(a.doctorUserId), since: a.createdAt, implicitPermissions: [...ac.DOCTOR_ASSIGNMENT_PERMISSIONS] })));
  res.json({
    patient: {
      id: patient.id, name: patient.name, consentMode: patient.consentMode,
      representative: patient.representativeUserId ? { userId: patient.representativeUserId, name: await lib.displayName(patient.representativeUserId) } : null
    },
    authority,
    catalog: ac.PERMISSIONS,
    grants: await Promise.all(grants.map(grantView)),
    clinicians,
    preferences: patient.preferences || {}
  });
});

// ── Decisions on requests and grants ──────────────────────────────────────
async function notifyGrantee(grant, message) {
  await NotificationService.createNotification(grant.granteeUserId, message, 'access_changed').catch(() => {});
}

router.post('/grants/:id/approve', authenticate, async (req, res) => {
  const patient = await subject(req);
  const authority = await authorityFor(req, patient);
  if (authority !== 'full') throw forbidden('Your representative needs to approve new sharing. You can always say no.');
  const grant = await loadGrant(req, patient);
  if (grant.status !== 'pending') throw badRequest('This request has already been answered.');
  const grantee = await db.User.findByPk(grant.granteeUserId);
  const permissions = ac.sanitizePermissions(req.body?.permissions ?? grant.permissions, grantee.role).filter(p => p !== 'consent.manage');
  await db.sequelize.transaction(async (transaction) => {
    await grant.update({ status: 'active', permissions, decidedByUserId: req.user.id, decidedAt: new Date(), needsReview: false }, { transaction });
    const cg = await careTeam.caregiverForUser(grant.granteeUserId);
    if (cg) await careTeam.ensureRelationship(patient.id, cg.id, transaction);
  });
  await audit.record(req, { action: 'grant.approve', resourceType: 'access_grant', resourceId: grant.id, patientUserId: patient.userId, reason: permissions.join(',') });
  await notifyGrantee(grant, `${patient.name} agreed to share some information with you in VAMORA.`);
  res.json(await grantView(grant));
});

router.post('/grants/:id/decline', authenticate, async (req, res) => {
  const patient = await subject(req);
  await authorityFor(req, patient);
  const grant = await loadGrant(req, patient);
  if (grant.status !== 'pending') throw badRequest('This request has already been answered.');
  await grant.update({ status: 'declined', decidedByUserId: req.user.id, decidedAt: new Date() });
  await audit.record(req, { action: 'grant.decline', resourceType: 'access_grant', resourceId: grant.id, patientUserId: patient.userId });
  await notifyGrantee(grant, `Your request to join ${patient.name}'s care team was not accepted.`);
  res.json({ success: true });
});

router.put('/grants/:id/permissions', authenticate, async (req, res) => {
  const patient = await subject(req);
  const authority = await authorityFor(req, patient);
  const grant = await loadGrant(req, patient);
  if (grant.status !== 'active') throw badRequest('Only active sharing can be changed.');
  const grantee = await db.User.findByPk(grant.granteeUserId);
  const current = new Set(ac.sanitizePermissions(grant.permissions, grantee.role));
  let next = ac.sanitizePermissions(req.body?.permissions, grantee.role);
  // consent.manage is only set via the clinician-recorded representative process.
  next = next.filter(p => p !== 'consent.manage');
  if (current.has('consent.manage') && patient.representativeUserId === grant.granteeUserId && authority === 'full') next.push('consent.manage');
  const expands = next.some(p => !current.has(p));
  if (expands && authority !== 'full') throw forbidden('Your representative needs to approve sharing more. You can always share less.');
  await grant.update({ permissions: next, needsReview: false, decidedByUserId: req.user.id, decidedAt: new Date() });
  await audit.record(req, { action: 'grant.update', resourceType: 'access_grant', resourceId: grant.id, patientUserId: patient.userId, reason: `${expands ? 'expand' : 'restrict'}:${next.join(',')}` });
  await notifyGrantee(grant, `${patient.name} changed what you can see in VAMORA.`);
  res.json(await grantView(grant));
});

router.post('/grants/:id/revoke', authenticate, async (req, res) => {
  const patient = await subject(req);
  await authorityFor(req, patient); // 'restrict' is enough
  const grant = await loadGrant(req, patient);
  if (!['active', 'pending'].includes(grant.status)) throw badRequest('Sharing has already stopped.');
  await db.sequelize.transaction(async (transaction) => {
    await grant.update({ status: 'revoked', revokedAt: new Date(), decidedByUserId: req.user.id }, { transaction });
    const cg = await careTeam.caregiverForUser(grant.granteeUserId);
    if (cg) await careTeam.removeRelationship(patient.id, cg.id, transaction);
  });
  await audit.record(req, { action: 'grant.revoke', resourceType: 'access_grant', resourceId: grant.id, patientUserId: patient.userId });
  await notifyGrantee(grant, `${patient.name} stopped sharing information with you in VAMORA.`);
  if (patient.representativeUserId === grant.granteeUserId) {
    // A person revoked their recorded representative: clinicians must review.
    const assignments = await db.DoctorPatientAssignment.findAll({ where: { patientUserId: patient.userId, status: 'active' } });
    await Promise.all(assignments.map(a => NotificationService.createNotification(a.doctorUserId,
      `${patient.name} stopped sharing with their recorded representative. Please review the consent arrangement.`, 'access_changed')));
  }
  res.json({ success: true });
});

router.post('/grants/:id/reviewed', authenticate, async (req, res) => {
  const patient = await subject(req);
  await authorityFor(req, patient);
  const grant = await loadGrant(req, patient);
  await grant.update({ needsReview: false });
  await audit.record(req, { action: 'grant.reviewed', resourceType: 'access_grant', resourceId: grant.id, patientUserId: patient.userId });
  res.json({ success: true });
});

/** Patient proactively shares with a caregiver or one of their doctors. */
router.post('/grants', authenticate, async (req, res) => {
  const patient = await subject(req);
  const authority = await authorityFor(req, patient);
  if (authority !== 'full') throw forbidden('Your representative needs to approve new sharing.');
  const email = String(req.body?.email || '').trim().toLowerCase();
  const grantee = await db.User.findOne({ where: { email } });
  if (!grantee || !['caregiver', 'doctor'].includes(grantee.role)) throw badRequest('You can share with a caregiver or one of your doctors who has a VAMORA account.');
  if (grantee.role === 'doctor') {
    const a = await db.DoctorPatientAssignment.findOne({ where: { patientUserId: patient.userId, doctorUserId: grantee.id, status: 'active' } });
    if (!a) throw badRequest('This doctor is not part of your care team.');
  }
  const permissions = ac.sanitizePermissions(req.body?.permissions, grantee.role).filter(p => p !== 'consent.manage');
  if (!permissions.length) throw badRequest('Choose at least one thing to share.');
  const existing = await db.AccessGrant.findOne({ where: { patientUserId: patient.userId, granteeUserId: grantee.id, status: { [Op.in]: ['active', 'pending'] } } });
  let grant;
  if (existing) {
    grant = await existing.update({ status: 'active', permissions: [...new Set([...existing.permissions, ...permissions])], decidedByUserId: req.user.id, decidedAt: new Date() });
  } else {
    grant = await db.AccessGrant.create({ patientUserId: patient.userId, granteeUserId: grantee.id, permissions, status: 'active', basis: 'patient_consent', decidedByUserId: req.user.id, decidedAt: new Date(), requestedByUserId: req.user.id });
  }
  const cg = await careTeam.caregiverForUser(grantee.id);
  if (cg) await careTeam.ensureRelationship(patient.id, cg.id);
  await audit.record(req, { action: 'grant.approve', resourceType: 'access_grant', resourceId: grant.id, patientUserId: patient.userId, reason: grant.permissions.join(',') });
  await notifyGrantee(grant, `${patient.name} shared some information with you in VAMORA.`);
  res.status(201).json(await grantView(grant));
});

// ── Transparency: who did what with my information ────────────────────────
router.get('/activity', authenticate, async (req, res) => {
  const patient = await subject(req);
  await authorityFor(req, patient);
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const events = await db.AuditEvent.findAll({
    where: { patientUserId: patient.userId, outcome: { [Op.in]: ['allowed', 'denied'] } },
    order: [['occurredAt', 'DESC']], limit
  });
  const names = new Map();
  const nameOf = async (id) => {
    if (!id) return 'System';
    if (id === patient.userId) return 'You';
    if (!names.has(id)) names.set(id, await lib.displayName(id));
    return names.get(id);
  };
  res.json(await Promise.all(events.map(async e => ({
    id: e.id, when: e.occurredAt, who: await nameOf(e.actorUserId), role: e.actorRole,
    action: e.action, description: ACTION_LABELS[e.action] || e.action.replace(/[._]/g, ' '),
    outcome: e.outcome, basis: e.accessBasis
  }))));
});

// ── Preferences (accessibility + opt-ins) ─────────────────────────────────
const PREF_SCHEMA = {
  moodCameraOptIn: v => typeof v === 'boolean',
  readAloud: v => typeof v === 'boolean',
  language: v => ['en', 'ur'].includes(v),
  textSize: v => ['normal', 'large', 'extra'].includes(v)
};

router.get('/preferences', authenticate, authorize('patient'), async (req, res) => {
  const patient = await db.Patient.findOne({ where: { userId: req.user.id } });
  res.json(patient?.preferences || {});
});

router.put('/preferences', authenticate, authorize('patient'), async (req, res) => {
  const patient = await db.Patient.findOne({ where: { userId: req.user.id } });
  if (!patient) throw notFound('Patient profile not found.');
  const next = { ...(patient.preferences || {}) };
  for (const [k, v] of Object.entries(req.body || {})) {
    if (!PREF_SCHEMA[k]) continue;
    if (!PREF_SCHEMA[k](v)) throw badRequest(`Invalid value for ${k}.`);
    next[k] = v;
  }
  await patient.update({ preferences: next });
  await audit.record(req, { action: 'preferences.update', patientUserId: req.user.id, reason: Object.keys(req.body || {}).join(',') });
  res.json(next);
});

module.exports = router;
