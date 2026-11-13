'use strict';
const db = require('../../models');
const { forbidden, notFound } = require('../utils/http');
const audit = require('./auditService');

/**
 * Consent-aware access control for patient information.
 *
 * Principles (see docs/PRIVACY_AND_SECURITY.md):
 *  1. Deny by default. Being a caregiver, doctor or admin grants NOTHING on
 *     its own. Access to a patient requires a relationship (a care-team
 *     assignment or an access grant).
 *  2. Least privilege. Permissions are fine-grained and purpose-specific.
 *  3. Role ceilings. A permission can only be granted to roles that could
 *     legitimately need it. Administrators can never receive patient-data
 *     permissions.
 *  4. Patient authority. The patient (or a representative recorded by a
 *     clinician) approves caregiver access. Restrictions are always honoured;
 *     expansions require decision authority.
 *  5. Every decision about patient data is auditable.
 */

const PERMISSIONS = Object.freeze({
  'memories.view': 'See all photos and memories',
  'memories.upload': 'Add photos and memories',
  'memories.delete': 'Remove photos and memories added by others',
  'voice.view': 'Listen to voice recordings',
  'voice.upload': 'Add voice recordings',
  'mood.view': 'See how the patient said they feel',
  'observations.view': 'Read care observations from the care team',
  'observations.create': 'Write care observations',
  'clinical.view': 'See appointments, medications and memory-test scores',
  'clinical.manage': 'Add appointments, medications and memory-test scores',
  'alerts.receive': 'Get alerts when the patient asks for help or reports feeling low',
  'ai.history.view': 'Read conversations with the Cara assistant',
  'consent.manage': 'Manage sharing decisions on the patient’s behalf'
});

const ALL = Object.keys(PERMISSIONS);

/** Maximum set of permissions a role can ever hold for a patient. */
const ROLE_CEILING = Object.freeze({
  caregiver: ALL.filter(p => p !== 'clinical.manage'),
  doctor: ALL.filter(p => p !== 'consent.manage' && p !== 'memories.delete'),
  patient: [],
  admin: [],
  super_admin: []
});

/** Implicit permissions of an active clinical assignment (no media, no chat). */
const DOCTOR_ASSIGNMENT_PERMISSIONS = Object.freeze([
  'clinical.view', 'clinical.manage', 'mood.view', 'observations.view'
]);

/** Default permissions when a clinician adds a caregiver to the care team. */
const CLINICIAN_LINKED_CAREGIVER_DEFAULT = Object.freeze([
  'clinical.view', 'mood.view', 'observations.view', 'observations.create', 'memories.upload', 'alerts.receive'
]);

/** What a caregiver asks for by default when requesting access. */
const CAREGIVER_REQUEST_DEFAULT = CLINICIAN_LINKED_CAREGIVER_DEFAULT;

/** Everything a patient can do with their own information. */
const PATIENT_SELF = Object.freeze(ALL.filter(p => p !== 'clinical.manage'));

function sanitizePermissions(perms, role) {
  const ceiling = new Set(ROLE_CEILING[role] || []);
  return [...new Set((Array.isArray(perms) ? perms : []).filter(p => ceiling.has(p)))].sort();
}

/**
 * Resolve the effective access of `user` to the patient whose users.id is
 * `patientUserId`. Cached per request.
 * @returns {{permissions:Set<string>, basis:string|null, grantId:number|null}}
 */
async function getAccess(user, patientUserId, req) {
  const key = `${user.id}:${patientUserId}`;
  if (req) {
    req._accessCache = req._accessCache || new Map();
    if (req._accessCache.has(key)) return req._accessCache.get(key);
  }
  const result = { permissions: new Set(), basis: null, grantId: null };

  if (user.role === 'patient' && user.id === patientUserId) {
    PATIENT_SELF.forEach(p => result.permissions.add(p));
    result.basis = 'self';
  } else if (user.role === 'caregiver' || user.role === 'doctor') {
    if (user.role === 'doctor') {
      const assignment = await db.DoctorPatientAssignment.findOne({
        where: { doctorUserId: user.id, patientUserId, status: 'active' }
      });
      if (assignment) {
        DOCTOR_ASSIGNMENT_PERMISSIONS.forEach(p => result.permissions.add(p));
        result.basis = 'clinical_assignment';
      }
    }
    const grant = await db.AccessGrant.findOne({
      where: { granteeUserId: user.id, patientUserId, status: 'active' }
    });
    if (grant) {
      sanitizePermissions(grant.permissions, user.role).forEach(p => result.permissions.add(p));
      result.basis = result.basis ? `${result.basis}+grant` : grant.basis;
      result.grantId = grant.id;
    }
  }
  // admin / super_admin: deliberately no patient-data permissions.

  if (req) req._accessCache.set(key, result);
  return result;
}

/**
 * Throw 403 (and audit the denial) unless `req.user` holds `permission` for
 * the patient. Returns the access object on success.
 */
async function requirePermission(req, patientUserId, permission, auditAction) {
  const access = await getAccess(req.user, patientUserId, req);
  if (!access.permissions.has(permission)) {
    await audit.record(req, {
      action: auditAction || `access.${permission}`,
      patientUserId, outcome: 'denied',
      reason: `missing ${permission}`, accessBasis: access.basis
    });
    throw forbidden('You do not have permission to see or change this information for this person.', 'permission_denied');
  }
  return access;
}

async function hasPermission(req, patientUserId, permission) {
  const access = await getAccess(req.user, patientUserId, req);
  return access.permissions.has(permission);
}

/**
 * Route parameters for caregiver/doctor endpoints use patients.id (the
 * frontend's convention). Translate to the patient's users.id, returning 404
 * for unknown ids. Callers must still check permissions: knowing an id
 * grants nothing.
 */
async function resolvePatientById(patientId) {
  const patient = await db.Patient.findByPk(patientId);
  if (!patient) throw notFound('Patient not found.');
  return patient;
}

/**
 * Decision authority over sharing for a patient:
 *   'full'     – may grant, expand, restrict and revoke
 *   'restrict' – may only restrict or revoke (the patient in representative mode)
 *   null       – none
 */
async function sharingAuthority(user, patient) {
  if (user.role === 'patient' && user.id === patient.userId) {
    return patient.consentMode === 'representative' ? 'restrict' : 'full';
  }
  if (patient.consentMode === 'representative' && patient.representativeUserId === user.id) {
    const access = await getAccess(user, patient.userId);
    if (access.permissions.has('consent.manage')) return 'full';
  }
  return null;
}

module.exports = {
  PERMISSIONS,
  ROLE_CEILING,
  DOCTOR_ASSIGNMENT_PERMISSIONS,
  CLINICIAN_LINKED_CAREGIVER_DEFAULT,
  CAREGIVER_REQUEST_DEFAULT,
  PATIENT_SELF,
  sanitizePermissions,
  getAccess,
  requirePermission,
  hasPermission,
  resolvePatientById,
  sharingAuthority
};
