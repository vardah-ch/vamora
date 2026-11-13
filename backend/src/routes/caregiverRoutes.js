'use strict';
const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const db = require('../../models');
const { authenticate, authorize } = require('../middlewares/auth');
const { imageUpload } = require('../middlewares/upload');
const ac = require('../services/accessControl');
const audit = require('../services/auditService');
const lib = require('../services/memoryLibrary');
const metrics = require('../services/careMetrics');
const NotificationService = require('../services/NotificationService');
const observationSummary = require('../ai/observationSummary');
const { parseId, parseUuid, badRequest, forbidden, notFound } = require('../utils/http');

/**
 * Caregiver API. Base: /api/v1/caregiver
 *
 * Audit fixes: S3 (IDOR – every patient route now checks a permission),
 * S4 (note deletion scoped to the author, and soft), S5 (adding a patient by
 * email now sends a REQUEST the patient must approve).
 */
const caregiverOnly = [authenticate, authorize('caregiver')];
const OBS_CATEGORIES = ['general', 'sleep', 'eating', 'mood', 'social', 'activity', 'medication', 'safety', 'communication'];

async function myCaregiver(req) {
  const cg = await db.Caregiver.findOne({ where: { userId: req.user.id } });
  if (!cg) throw notFound('Caregiver profile not found.');
  return cg;
}

async function patientFromParam(req) {
  return ac.resolvePatientById(parseId(req.params.patientId, 'patientId'));
}

// ── Patients I help (active grants) + my pending requests ─────────────────
router.get('/patients', ...caregiverOnly, async (req, res) => {
  const grants = await db.AccessGrant.findAll({
    where: { granteeUserId: req.user.id, status: { [Op.in]: ['active', 'pending'] } }
  });
  const result = await Promise.all(grants.map(async (g) => {
    const patient = await db.Patient.findOne({ where: { userId: g.patientUserId } });
    if (!patient) return null;
    const perms = new Set(ac.sanitizePermissions(g.permissions, 'caregiver'));
    const base = { id: patient.id, userId: patient.userId, name: patient.name, grantStatus: g.status, permissions: [...perms] };
    if (g.status !== 'active') return base;
    let moodInfo = {};
    if (perms.has('mood.view')) {
      const weekAgo = new Date(Date.now() - 7 * 864e5);
      const moods = await db.Mood.findAll({ where: { patientId: patient.userId, recordedAt: { [Op.gte]: weekAgo } }, order: [['recordedAt', 'DESC']] });
      const latest = metrics.selfReported(moods)[0];
      moodInfo = { latestMood: latest?.mood || null, latestMoodDate: latest?.recordedAt || null, hasAlert: metrics.lowMoodToday(moods), wellnessScore: metrics.moodAverage(moods), wellnessNote: metrics.METRIC_NOTE };
    }
    const photoCount = perms.has('memories.view') ? await db.Photo.count({ where: { patientId: patient.userId, deletedAt: null } }) : null;
    return { ...base, ...moodInfo, photoCount };
  }));
  res.json(result.filter(Boolean));
});

// ── Request access to a patient (replaces silent add-by-email) ────────────
router.post('/patients/add', ...caregiverOnly, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) throw badRequest('Email is required.');
  const relationshipLabel = String(req.body?.relationship || '').trim().slice(0, 100) || null;
  // Same response whether or not the account exists (no account enumeration).
  const generic = { message: 'If a VAMORA account exists for this email, the person has been asked to approve your request. You will see their information once they agree.', status: 'pending' };

  const patientUser = await db.User.findOne({ where: { email, role: 'patient' } });
  if (!patientUser) return res.json(generic);
  const existing = await db.AccessGrant.findOne({ where: { patientUserId: patientUser.id, granteeUserId: req.user.id, status: { [Op.in]: ['pending', 'active'] } } });
  if (existing) return res.json(generic);

  const grant = await db.AccessGrant.create({
    patientUserId: patientUser.id, granteeUserId: req.user.id,
    permissions: [...ac.CAREGIVER_REQUEST_DEFAULT], status: 'pending', basis: 'caregiver_request',
    relationshipLabel, requestedByUserId: req.user.id
  });
  const who = await lib.displayName(req.user.id);
  await NotificationService.createNotification(patientUser.id,
    `${who}${relationshipLabel ? ` (${relationshipLabel})` : ''} would like to help with your care in VAMORA. Open "My Privacy" to say yes or no.`, 'access_request');
  const patient = await db.Patient.findOne({ where: { userId: patientUser.id } });
  if (patient?.representativeUserId) {
    await NotificationService.createNotification(patient.representativeUserId, `${who} asked to join ${patient.name}'s care team in VAMORA.`, 'access_request');
  }
  await audit.record(req, { action: 'grant.request', resourceType: 'access_grant', resourceId: grant.id, patientUserId: patientUser.id });
  res.json(generic);
});

// ── Single patient (only what I am allowed to see) ────────────────────────
router.get('/patients/:patientId', ...caregiverOnly, async (req, res) => {
  const patient = await patientFromParam(req);
  const access = await ac.getAccess(req.user, patient.userId, req);
  if (access.permissions.size === 0) {
    await audit.record(req, { action: 'patient.view', patientUserId: patient.userId, outcome: 'denied', reason: 'no active grant' });
    throw forbidden('This person has not shared their information with you.', 'permission_denied');
  }
  const caregiver = await myCaregiver(req);
  const p = access.permissions;
  const [moods, photos, appointments, medications, careNotes] = await Promise.all([
    p.has('mood.view') ? db.Mood.findAll({ where: { patientId: patient.userId }, order: [['recordedAt', 'DESC']], limit: 14 }) : null,
    (p.has('memories.view') || p.has('memories.upload')) ? lib.listPhotos(req, patient.userId, { limit: 5 }) : null,
    p.has('clinical.view') ? db.Appointment.findAll({ where: { patientId: patient.userId }, order: [['appointmentDate', 'ASC']] }) : null,
    p.has('clinical.view') ? db.Medication.findAll({ where: { patientId: patient.userId }, order: [['createdAt', 'DESC']] }) : null,
    db.CareNote.findAll({
      where: { patientId: patient.userId, retractedAt: null, ...(p.has('observations.view') ? {} : { caregiverId: caregiver.id }) },
      order: [['createdAt', 'DESC']], limit: 20
    })
  ]);
  await audit.record(req, { action: 'patient.view', patientUserId: patient.userId, accessBasis: access.basis, grantId: access.grantId });
  res.json({
    patient: { id: patient.id, userId: patient.userId, name: patient.name },
    permissions: [...p],
    moods, photos, appointments, medications, careNotes,
    wellnessScore: moods ? metrics.moodAverage(moods.slice(0, 7)) : null,
    wellnessNote: metrics.METRIC_NOTE,
    hasAlert: moods ? metrics.lowMoodToday(moods) : false,
    latestMood: moods ? metrics.selfReported(moods)[0] || null : null
  });
});

router.get('/patients/:patientId/medications', ...caregiverOnly, async (req, res) => {
  const patient = await patientFromParam(req);
  const access = await ac.requirePermission(req, patient.userId, 'clinical.view', 'medications.view');
  const meds = await db.Medication.findAll({ where: { patientId: patient.userId }, order: [['createdAt', 'DESC']] });
  await audit.record(req, { action: 'medications.view', patientUserId: patient.userId, accessBasis: access.basis, grantId: access.grantId });
  res.json(meds);
});

// ── Observations (care notes) ─────────────────────────────────────────────
router.post('/patients/:patientId/notes', ...caregiverOnly, async (req, res) => {
  const patient = await patientFromParam(req);
  const access = await ac.requirePermission(req, patient.userId, 'observations.create', 'observation.create');
  const note = String(req.body?.note || '').trim();
  if (!note) throw badRequest('Note is required.');
  if (note.length > 4000) throw badRequest('Note is too long.');
  const category = req.body?.category || 'general';
  if (!OBS_CATEGORIES.includes(category)) throw badRequest(`Category must be one of: ${OBS_CATEGORIES.join(', ')}.`);
  const caregiver = await myCaregiver(req);
  const careNote = await db.CareNote.create({ patientId: patient.userId, caregiverId: caregiver.id, note, category });
  await audit.record(req, { action: 'observation.create', resourceType: 'care_note', resourceId: careNote.id, patientUserId: patient.userId, accessBasis: access.basis, grantId: access.grantId });
  res.json(careNote);
});

/**
 * Observations are a shared record, so they are never hard-deleted. The
 * author can RETRACT their own note (with an optional reason); it disappears
 * from views but remains in the database for accountability.
 */
router.delete('/notes/:noteId', ...caregiverOnly, async (req, res) => {
  const note = await db.CareNote.findByPk(parseUuid(req.params.noteId, 'noteId'));
  if (!note || note.retractedAt) throw notFound('Note not found.');
  const caregiver = await myCaregiver(req);
  if (note.caregiverId !== caregiver.id) {
    await audit.record(req, { action: 'observation.retract', resourceType: 'care_note', resourceId: note.id, patientUserId: note.patientId, outcome: 'denied', reason: 'not author' });
    throw forbidden('You can only retract notes you wrote.');
  }
  await note.update({ retractedAt: new Date(), retractedReason: String(req.body?.reason || '').slice(0, 300) || null });
  await audit.record(req, { action: 'observation.retract', resourceType: 'care_note', resourceId: note.id, patientUserId: note.patientId });
  res.json({ message: 'Note retracted.' });
});

router.get('/patients/:patientId/observation-summary', ...caregiverOnly, async (req, res) => {
  const patient = await patientFromParam(req);
  await ac.requirePermission(req, patient.userId, 'observations.view', 'observations.summary');
  const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 90);
  const since = new Date(Date.now() - days * 864e5);
  const [notes, moods] = await Promise.all([
    db.CareNote.findAll({ where: { patientId: patient.userId, retractedAt: null, createdAt: { [Op.gte]: since } }, order: [['createdAt', 'ASC']] }),
    (await ac.hasPermission(req, patient.userId, 'mood.view'))
      ? db.Mood.findAll({ where: { patientId: patient.userId, recordedAt: { [Op.gte]: since } } }).then(metrics.selfReported) : []
  ]);
  await audit.record(req, { action: 'observations.summary', patientUserId: patient.userId });
  res.json(await observationSummary.summarize(notes, moods, { days }));
});

// ── Memories for a patient ────────────────────────────────────────────────
router.post('/patients/:patientId/photos', ...caregiverOnly, ...imageUpload('photo'), async (req, res) => {
  const patient = await patientFromParam(req);
  res.status(201).json(await lib.addPhoto(req, patient.userId));
});

router.get('/patients/:patientId/photos', ...caregiverOnly, async (req, res) => {
  const patient = await patientFromParam(req);
  res.json(await lib.listPhotos(req, patient.userId));
});

// ── Patient's own appointments (used by the patient dashboard) ────────────
router.get('/my-appointments', authenticate, authorize('patient'), async (req, res) => {
  const upcoming = await db.Appointment.findAll({
    where: { patientId: req.user.id, appointmentDate: { [Op.gte]: new Date() } },
    order: [['appointmentDate', 'ASC']], limit: 5
  });
  res.json(upcoming);
});

module.exports = router;
