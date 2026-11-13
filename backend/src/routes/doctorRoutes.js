'use strict';
const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const db = require('../../models');
const { authenticate, authorize } = require('../middlewares/auth');
const ac = require('../services/accessControl');
const audit = require('../services/auditService');
const metrics = require('../services/careMetrics');
const careTeam = require('../services/careTeam');
const NotificationService = require('../services/NotificationService');
const observationSummary = require('../ai/observationSummary');
const { parseId, parseUuid, badRequest, forbidden, notFound, conflict, generateTemporaryPassword } = require('../utils/http');

/**
 * Doctor API. Base: /api/v1/doctor
 *
 * Audit S2: doctors previously saw and could delete EVERY patient. Access now
 * requires an active doctor↔patient assignment. Clinical data comes with the
 * assignment; photos, voice and companion conversations do NOT — the patient
 * must grant those explicitly. Doctors can no longer hard-delete a patient's
 * account and memories; "remove" ends the doctor's own assignment.
 */
const doctorOnly = [authenticate, authorize('doctor')];
const MOOD_EMOJI = { happy: '😊', calm: '😌', sad: '😔', anxious: '😰', frustrated: '😡', tired: '😴', excited: '🤩', confused: '😕' };

async function assignedPatient(req, permission, action) {
  const patient = await ac.resolvePatientById(parseId(req.params.id, 'patient id'));
  const access = await ac.requirePermission(req, patient.userId, permission, action);
  return { patient, access };
}

function caregiversOnTeam(patientUserId) {
  return db.AccessGrant.findAll({
    where: { patientUserId, status: { [Op.in]: ['active', 'pending'] } },
    include: [{ model: db.User, as: 'grantee', attributes: ['id', 'email', 'role'], include: [{ model: db.Caregiver, as: 'caregiverProfile', attributes: ['id', 'name', 'phone'] }] }]
  }).then(gs => gs.filter(g => g.grantee?.role === 'caregiver').map(g => ({
    id: g.grantee.caregiverProfile?.id, userId: g.grantee.id, name: g.grantee.caregiverProfile?.name, phone: g.grantee.caregiverProfile?.phone,
    grantStatus: g.status, permissions: ac.sanitizePermissions(g.permissions, 'caregiver'), basis: g.basis, isRepresentative: false
  })));
}

// ── My patients ───────────────────────────────────────────────────────────
router.get('/patients', ...doctorOnly, async (req, res) => {
  const assignments = await db.DoctorPatientAssignment.findAll({ where: { doctorUserId: req.user.id, status: 'active' } });
  const userIds = assignments.map(a => a.patientUserId);
  const patients = await db.Patient.findAll({
    where: { userId: { [Op.in]: userIds.length ? userIds : [-1] } },
    include: [{ model: db.User, as: 'user', attributes: ['email'] }],
    order: [['name', 'ASC']]
  });
  const result = await Promise.all(patients.map(async (p) => {
    const [moods, mmse, team] = await Promise.all([
      db.Mood.findAll({ where: { patientId: p.userId }, order: [['recordedAt', 'DESC']], limit: 14 }),
      db.MmseScore.findAll({ where: { patientId: p.userId }, order: [['assessmentDate', 'ASC']] }),
      caregiversOnTeam(p.userId)
    ]);
    const latestSelf = metrics.selfReported(moods)[0] || null;
    const latestMmse = mmse.length ? mmse[mmse.length - 1].score : null;
    const activeCg = team.find(c => c.grantStatus === 'active');
    return {
      id: p.id, userId: p.userId, name: p.name, diagnosisType: p.diagnosisType, email: p.user?.email || '',
      latestMood: latestSelf?.mood || null,
      latestMoodEmoji: latestSelf ? (MOOD_EMOJI[latestSelf.mood] || '😐') : null,
      wellnessScore: metrics.moodAverage(moods.slice(0, 7)),
      wellnessNote: metrics.METRIC_NOTE,
      latestMmseScore: latestMmse,
      mmseBand: metrics.mmseBand(latestMmse),
      mmseTrend: metrics.mmseTrend(mmse),
      // Kept for the existing UI; now a score band, never "Declining" from one value.
      cognitiveStatus: latestMmse === null ? null : `MMSE ${metrics.mmseBand(latestMmse)}`,
      assignedCaregiver: activeCg ? { id: activeCg.id, name: activeCg.name } : null,
      caregiverCount: team.filter(c => c.grantStatus === 'active').length,
      consentMode: p.consentMode,
      hasAlert: metrics.lowMoodToday(moods)
    };
  }));
  res.json({ status: 'success', data: result });
});

router.get('/patients/:id', ...doctorOnly, async (req, res) => {
  const { patient, access } = await assignedPatient(req, 'clinical.view', 'patient.view');
  const p = access.permissions;
  const [user, moods, appointments, medications, mmseScores, careNotes, team, photoCount] = await Promise.all([
    db.User.findByPk(patient.userId, { attributes: ['email'] }),
    db.Mood.findAll({ where: { patientId: patient.userId }, order: [['recordedAt', 'DESC']], limit: 20 }),
    db.Appointment.findAll({ where: { patientId: patient.userId }, order: [['appointmentDate', 'ASC']] }),
    db.Medication.findAll({ where: { patientId: patient.userId }, order: [['createdAt', 'DESC']] }),
    db.MmseScore.findAll({ where: { patientId: patient.userId }, order: [['assessmentDate', 'ASC']] }),
    p.has('observations.view') ? db.CareNote.findAll({ where: { patientId: patient.userId, retractedAt: null }, order: [['createdAt', 'DESC']], limit: 30 }) : [],
    caregiversOnTeam(patient.userId),
    p.has('memories.view') ? db.Photo.count({ where: { patientId: patient.userId, deletedAt: null } }) : null
  ]);
  team.forEach(c => { c.isRepresentative = patient.consentMode === 'representative' && patient.representativeUserId === c.userId; });
  const latestMmse = mmseScores.length ? mmseScores[mmseScores.length - 1].score : null;
  await audit.record(req, { action: 'patient.view', patientUserId: patient.userId, accessBasis: access.basis, grantId: access.grantId });
  res.json({
    status: 'success',
    data: {
      patient: {
        id: patient.id, userId: patient.userId, name: patient.name, email: user?.email || '',
        diagnosisType: patient.diagnosisType, diagnosisDate: patient.diagnosisDate, dateOfBirth: patient.dateOfBirth,
        consentMode: patient.consentMode
      },
      permissions: [...p],
      assignedCaregiver: team.find(c => c.grantStatus === 'active') || null,
      careTeam: team,
      moods: moods.map(m => ({ ...m.toJSON(), selfReported: m.source !== 'camera' })),
      appointments, medications, mmseScores, careNotes,
      photoCount,
      wellnessScore: metrics.moodAverage(moods.slice(0, 7)),
      wellnessNote: metrics.METRIC_NOTE,
      latestMood: metrics.selfReported(moods)[0] || null,
      latestMmseScore: latestMmse,
      mmseBand: metrics.mmseBand(latestMmse),
      mmseTrend: metrics.mmseTrend(mmseScores),
      cognitiveStatus: latestMmse === null ? null : `MMSE ${metrics.mmseBand(latestMmse)}`
    }
  });
});

/** Ends THIS doctor's assignment. The patient's account and data are untouched. */
router.delete('/patients/:id', ...doctorOnly, async (req, res) => {
  const patient = await ac.resolvePatientById(parseId(req.params.id, 'patient id'));
  const a = await db.DoctorPatientAssignment.findOne({ where: { doctorUserId: req.user.id, patientUserId: patient.userId, status: 'active' } });
  if (!a) throw forbidden('This person is not on your patient list.');
  await a.update({ status: 'ended', endedAt: new Date() });
  await audit.record(req, { action: 'assignment.end', resourceType: 'doctor_assignment', resourceId: a.id, patientUserId: patient.userId });
  res.json({ status: 'success', message: 'Removed from your patient list. Their account and memories were not deleted.' });
});

// ── Caregivers I work with ────────────────────────────────────────────────
router.get('/caregivers', ...doctorOnly, async (req, res) => {
  const assignments = await db.DoctorPatientAssignment.findAll({ where: { doctorUserId: req.user.id, status: 'active' } });
  const patientUserIds = assignments.map(a => a.patientUserId);
  const grants = patientUserIds.length ? await db.AccessGrant.findAll({ where: { patientUserId: { [Op.in]: patientUserIds }, status: 'active' } }) : [];
  const teamUserIds = new Set(grants.map(g => g.granteeUserId));
  const caregivers = await db.Caregiver.findAll({
    where: { [Op.or]: [{ doctorId: req.user.id }, { userId: { [Op.in]: teamUserIds.size ? [...teamUserIds] : [-1] } }] },
    include: [{ model: db.User, as: 'user', attributes: ['email'] }],
    order: [['name', 'ASC']]
  });
  const patients = patientUserIds.length ? await db.Patient.findAll({ where: { userId: { [Op.in]: patientUserIds } }, attributes: ['userId', 'name'] }) : [];
  const nameOf = new Map(patients.map(p => [p.userId, p.name]));
  const result = await Promise.all(caregivers.map(async (cg) => {
    const mine = grants.filter(g => g.granteeUserId === cg.userId);
    const lastNote = await db.CareNote.findOne({ where: { caregiverId: cg.id, patientId: { [Op.in]: patientUserIds.length ? patientUserIds : [-1] } }, order: [['createdAt', 'DESC']] });
    return {
      id: cg.id, name: cg.name || 'Unknown', email: cg.user?.email || '', phone: cg.phone || null,
      patientCount: mine.length, patientNames: mine.map(g => nameOf.get(g.patientUserId)).filter(Boolean),
      lastActivityDate: lastNote?.createdAt || null
    };
  }));
  res.json({ status: 'success', data: result });
});

// ── Appointments ──────────────────────────────────────────────────────────
router.post('/patients/:id/appointments', ...doctorOnly, async (req, res) => {
  const { patient, access } = await assignedPatient(req, 'clinical.manage', 'appointment.create');
  const { title, doctorName, appointmentType, appointmentDate, notes } = req.body || {};
  if (!title || !appointmentDate || Number.isNaN(Date.parse(appointmentDate))) throw badRequest('Title and a valid date are required.');
  const appt = await db.Appointment.create({ patientId: patient.userId, doctorId: req.user.id, title, doctorName, appointmentType, appointmentDate, notes });
  await audit.record(req, { action: 'appointment.create', resourceType: 'appointment', resourceId: appt.id, patientUserId: patient.userId, accessBasis: access.basis });
  NotificationService.sendCheckupNotifications(patient.userId, req.user.id, appointmentDate, title).catch(() => {});
  res.status(201).json({ status: 'success', data: appt });
});

router.delete('/appointments/:id', ...doctorOnly, async (req, res) => {
  const appt = await db.Appointment.findByPk(parseUuid(req.params.id));
  if (!appt) throw notFound('Appointment not found.');
  await ac.requirePermission(req, appt.patientId, 'clinical.manage', 'appointment.delete');
  await appt.destroy();
  await audit.record(req, { action: 'appointment.delete', resourceType: 'appointment', resourceId: appt.id, patientUserId: appt.patientId });
  res.json({ status: 'success', message: 'Appointment deleted.' });
});

// ── Medications ───────────────────────────────────────────────────────────
router.post('/patients/:id/medications', ...doctorOnly, async (req, res) => {
  const { patient, access } = await assignedPatient(req, 'clinical.manage', 'medication.create');
  const { medicationName, dosage, frequency, timing, startDate, endDate, notes } = req.body || {};
  if (!medicationName) throw badRequest('Medication name is required.');
  const med = await db.Medication.create({ patientId: patient.userId, doctorId: req.user.id, medicationName, dosage, frequency, timing, startDate: startDate || null, endDate: endDate || null, notes });
  await audit.record(req, { action: 'medication.create', resourceType: 'medication', resourceId: med.id, patientUserId: patient.userId, accessBasis: access.basis });
  NotificationService.sendMedicationNotification(patient.userId, { medicationName, dosage, frequency, doctorUserId: req.user.id }).catch(() => {});
  res.status(201).json({ status: 'success', data: med });
});

router.get('/patients/:id/medications', ...doctorOnly, async (req, res) => {
  const { patient } = await assignedPatient(req, 'clinical.view', 'medications.view');
  res.json({ status: 'success', data: await db.Medication.findAll({ where: { patientId: patient.userId }, order: [['createdAt', 'DESC']] }) });
});

router.delete('/medications/:id', ...doctorOnly, async (req, res) => {
  const med = await db.Medication.findByPk(parseUuid(req.params.id));
  if (!med) throw notFound('Medication not found.');
  await ac.requirePermission(req, med.patientId, 'clinical.manage', 'medication.delete');
  await med.destroy();
  await audit.record(req, { action: 'medication.delete', resourceType: 'medication', resourceId: med.id, patientUserId: med.patientId });
  res.json({ status: 'success', message: 'Medication deleted.' });
});

// ── MMSE ──────────────────────────────────────────────────────────────────
router.post('/patients/:id/mmse', ...doctorOnly, async (req, res) => {
  const { patient, access } = await assignedPatient(req, 'clinical.manage', 'mmse.create');
  const { score, assessmentDate, notes } = req.body || {};
  const s = Number(score);
  if (!Number.isInteger(s) || s < 0 || s > 30 || !assessmentDate) throw badRequest('A whole-number score from 0 to 30 and an assessment date are required.');
  const entry = await db.MmseScore.create({ patientId: patient.userId, doctorId: req.user.id, score: s, assessmentDate, notes });
  await audit.record(req, { action: 'mmse.create', resourceType: 'mmse', resourceId: entry.id, patientUserId: patient.userId, accessBasis: access.basis });
  res.status(201).json({ status: 'success', data: entry });
});

router.get('/patients/:id/mmse', ...doctorOnly, async (req, res) => {
  const { patient } = await assignedPatient(req, 'clinical.view', 'mmse.view');
  res.json({ status: 'success', data: await db.MmseScore.findAll({ where: { patientId: patient.userId }, order: [['assessmentDate', 'ASC']] }) });
});

router.get('/patients/:id/observation-summary', ...doctorOnly, async (req, res) => {
  const { patient } = await assignedPatient(req, 'observations.view', 'observations.summary');
  const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 90);
  const since = new Date(Date.now() - days * 864e5);
  const [notes, moods] = await Promise.all([
    db.CareNote.findAll({ where: { patientId: patient.userId, retractedAt: null, createdAt: { [Op.gte]: since } }, order: [['createdAt', 'ASC']] }),
    db.Mood.findAll({ where: { patientId: patient.userId, recordedAt: { [Op.gte]: since } } }).then(metrics.selfReported)
  ]);
  res.json({ status: 'success', data: await observationSummary.summarize(notes, moods, { days }) });
});

router.get('/my-medications', authenticate, authorize('patient'), async (req, res) => {
  res.json(await db.Medication.findAll({ where: { patientId: req.user.id }, order: [['createdAt', 'DESC']] }));
});

// ── Consent mode (clinician records how sharing decisions are made) ───────
router.put('/patients/:id/consent-mode', ...doctorOnly, async (req, res) => {
  const { patient } = await assignedPatient(req, 'clinical.manage', 'consent_mode.update');
  const mode = req.body?.mode;
  const basis = String(req.body?.basis || '').trim();
  if (!['self', 'supported', 'representative'].includes(mode)) throw badRequest('Mode must be self, supported or representative.');

  await db.sequelize.transaction(async (transaction) => {
    // Remove consent.manage from any previous representative.
    if (patient.representativeUserId) {
      const old = await db.AccessGrant.findOne({ where: { patientUserId: patient.userId, granteeUserId: patient.representativeUserId, status: 'active' }, transaction });
      if (old) await old.update({ permissions: old.permissions.filter(p => p !== 'consent.manage') }, { transaction });
    }
    let representativeUserId = null;
    if (mode === 'representative') {
      if (basis.length < 15) throw badRequest('Please record the basis for representative authority (e.g. document type and reference, date verified).');
      const repUser = await db.User.findOne({ where: { email: String(req.body?.representativeEmail || '').trim().toLowerCase(), role: 'caregiver' }, transaction });
      if (!repUser) throw badRequest('The representative must be a caregiver with a VAMORA account.');
      const grant = await db.AccessGrant.findOne({ where: { patientUserId: patient.userId, granteeUserId: repUser.id, status: 'active' }, transaction });
      if (!grant) throw badRequest('The representative must already be on this person\'s care team.');
      await grant.update({ permissions: [...new Set([...grant.permissions, 'consent.manage'])] }, { transaction });
      representativeUserId = repUser.id;
    }
    await patient.update({
      consentMode: mode,
      representativeUserId,
      representativeBasis: mode === 'representative' ? basis : (basis || null),
      consentModeRecordedBy: req.user.id,
      consentModeRecordedAt: new Date()
    }, { transaction });
  });
  await audit.record(req, { action: 'consent_mode.update', resourceType: 'patient', resourceId: patient.id, patientUserId: patient.userId, reason: `mode=${mode}` });
  await NotificationService.createNotification(patient.userId,
    mode === 'representative'
      ? 'Your doctor recorded that a representative will help make sharing decisions with you. You can always see who has access, and you can always reduce sharing, in "My Privacy".'
      : 'Your doctor updated how sharing decisions are made. You decide who can see your information in "My Privacy".',
    'access_changed');
  res.json({ status: 'success', data: { consentMode: mode } });
});

// ── Team management ───────────────────────────────────────────────────────
router.post('/team/patients', ...doctorOnly, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!name || !email) throw badRequest('Name and email are required.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('Enter a valid email address.');
  if (await db.User.findOne({ where: { email } })) throw conflict('An account with this email already exists.');
  const customPassword = req.body?.password && String(req.body.password).length >= 8 ? String(req.body.password) : null;
  const tempPassword = customPassword || generateTemporaryPassword();
  const { user, patient } = await db.sequelize.transaction(async (transaction) => {
    const u = await db.User.create({ email, password: tempPassword, role: 'patient' }, { transaction });
    const p = await db.Patient.create({ userId: u.id, name, createdByDoctorId: req.user.id }, { transaction });
    await db.DoctorPatientAssignment.create({ patientUserId: u.id, doctorUserId: req.user.id, basis: 'created_by_clinician', assignedByUserId: req.user.id }, { transaction });
    return { user: u, patient: p };
  });
  await audit.record(req, { action: 'patient.create', resourceType: 'patient', resourceId: patient.id, patientUserId: user.id });
  res.status(201).json({ status: 'success', data: { id: patient.id, name: patient.name, email: user.email, createdAt: patient.createdAt, defaultPassword: customPassword ? undefined : tempPassword } });
});

/**
 * Link a caregiver to this doctor, and optionally add them to a patient's care
 * team. Clinician-added caregivers get care-coordination permissions only
 * (no photos, voice or conversations) and the patient is told and can change
 * this. Other caregivers are NOT removed (audit B6).
 */
router.post('/team/caregivers/link', ...doctorOnly, async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  if (!email) throw badRequest('Caregiver email is required.');
  const cgUser = await db.User.findOne({ where: { email, role: 'caregiver' } });
  if (!cgUser) throw notFound('No caregiver found with this email.');
  const caregiver = await db.Caregiver.findOne({ where: { userId: cgUser.id } });
  if (!caregiver) throw notFound('Caregiver profile not found.');
  if (caregiver.doctorId && caregiver.doctorId !== req.user.id && !req.body.patientId) {
    throw conflict('Caregiver is already linked to another doctor.');
  }
  if (!caregiver.doctorId) await caregiver.update({ doctorId: req.user.id });

  if (req.body.patientId) {
    const patient = await ac.resolvePatientById(parseId(req.body.patientId, 'patientId'));
    await ac.requirePermission(req, patient.userId, 'clinical.manage', 'care_team.add');
    const existing = await db.AccessGrant.findOne({ where: { patientUserId: patient.userId, granteeUserId: cgUser.id, status: { [Op.in]: ['active', 'pending'] } } });
    if (existing && existing.status === 'active') {
      return res.json({ status: 'success', message: 'Caregiver is already on this care team.' });
    }
    await db.sequelize.transaction(async (transaction) => {
      if (existing) {
        await existing.update({ status: 'active', basis: 'clinician_assignment', needsReview: true, decidedByUserId: req.user.id, decidedAt: new Date() }, { transaction });
      } else {
        await db.AccessGrant.create({
          patientUserId: patient.userId, granteeUserId: cgUser.id, permissions: [...ac.CLINICIAN_LINKED_CAREGIVER_DEFAULT],
          status: 'active', basis: 'clinician_assignment', needsReview: true, requestedByUserId: req.user.id,
          decidedByUserId: req.user.id, decidedAt: new Date()
        }, { transaction });
      }
      await careTeam.ensureRelationship(patient.id, caregiver.id, transaction);
    });
    await audit.record(req, { action: 'care_team.add', resourceType: 'caregiver', resourceId: caregiver.id, patientUserId: patient.userId, accessBasis: 'clinician_assignment' });
    await NotificationService.createNotification(patient.userId,
      `Your doctor added ${caregiver.name || 'a caregiver'} to your care team. They can see your appointments and how you said you feel, but not your photos or recordings unless you allow it. You can change this in "My Privacy".`,
      'care_team_changed');
  }
  res.json({ status: 'success', message: 'Caregiver linked.' });
});

module.exports = router;
