'use strict';
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const db = require('../../models');
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../config/jwt');
const { HttpError, conflict } = require('../utils/http');
const audit = require('./auditService');

/**
 * Authentication service.
 *
 * Audit fixes:
 *  S1 – public registration is limited to 'patient' and 'caregiver'. Doctor and
 *       administrator accounts can only be created by a super-admin. A
 *       self-registered caregiver gets NO patient access until a patient
 *       approves a request (or a clinician links them).
 *  B3 – locked doctor/caregiver accounts cannot sign in.
 *  S7 – logout and password change revoke all tokens (tokenVersion).
 *  S8 – password-reset tokens are stored only as SHA-256 hashes and are never
 *       returned by the API (unless DEV_EXPOSE_RESET_TOKEN=true in development).
 */

const SELF_REGISTRABLE_ROLES = ['patient', 'caregiver'];
const unauthorized = (m) => new HttpError(401, m, 'unauthorized');
let _dummy;
const dummyHash = () => (_dummy = _dummy || bcrypt.hashSync('vamora-timing-equaliser', 12));
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

const PROFILE_INCLUDES = () => [
  { model: db.Patient, as: 'patientProfile' },
  { model: db.Caregiver, as: 'caregiverProfile' },
  { model: db.Doctor, as: 'doctorProfile' }
];

function profileFor(user) {
  if (user.role === 'patient') return user.patientProfile || null;
  if (user.role === 'caregiver') return user.caregiverProfile || null;
  if (user.role === 'doctor') return user.doctorProfile || null;
  return null;
}

function publicProfile(user) {
  const profile = profileFor(user);
  if (!profile) return null;
  const p = profile.toJSON();
  // Never send representative evidence notes or internal fields to the client by default.
  delete p.representativeBasis;
  return p;
}

function issueTokens(user) {
  return { accessToken: generateAccessToken(user), refreshToken: generateRefreshToken(user) };
}

const register = async ({ email, password, role, name, dateOfBirth, phone }) => {
  const finalRole = role || 'patient';
  if (!SELF_REGISTRABLE_ROLES.includes(finalRole)) {
    throw new HttpError(403, 'Doctor and administrator accounts are created by the system administrator.', 'role_not_self_registrable');
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  if (await db.User.findOne({ where: { email: normalizedEmail } })) {
    throw conflict('Email is already registered');
  }
  const user = await db.sequelize.transaction(async (transaction) => {
    const u = await db.User.create({ email: normalizedEmail, password, role: finalRole }, { transaction });
    if (finalRole === 'patient') {
      await db.Patient.create({ userId: u.id, name, dateOfBirth: dateOfBirth || null }, { transaction });
    } else {
      await db.Caregiver.create({ userId: u.id, name, phone: phone || null }, { transaction });
    }
    return u;
  });
  const full = await db.User.findByPk(user.id, { include: PROFILE_INCLUDES() });
  return { user: { ...full.toSafeObject(), profile: publicProfile(full) }, ...issueTokens(full) };
};

const login = async (email, password, req) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  let user = await db.User.findOne({ where: { email: normalizedEmail }, include: PROFILE_INCLUDES() });
  if (!user) {
    // Accounts created before 2026-11 were stored with validator.normalizeEmail()
    // (which e.g. strips dots from Gmail addresses). Try that form too.
    const legacy = validator.normalizeEmail(normalizedEmail);
    if (legacy && legacy !== normalizedEmail) {
      user = await db.User.findOne({ where: { email: legacy }, include: PROFILE_INCLUDES() });
    }
  }

  // Constant-ish work whether or not the account exists (limits user enumeration by timing).
  const ok = user ? await user.comparePassword(String(password || '')) : await bcrypt.compare(String(password || ''), dummyHash());
  if (!user || !ok) {
    await audit.record(null, { actorUserId: user?.id || null, action: 'auth.login', outcome: 'denied', reason: 'bad credentials', requestId: req?.id });
    throw unauthorized('Invalid email or password');
  }
  if (!user.isActive) {
    await audit.record(null, { actorUserId: user.id, actorRole: user.role, action: 'auth.login', outcome: 'denied', reason: 'inactive' });
    throw unauthorized('Your account has been deactivated. Please contact support.');
  }
  if (user.doctorProfile?.isLocked || user.caregiverProfile?.isLocked) {
    await audit.record(null, { actorUserId: user.id, actorRole: user.role, action: 'auth.login', outcome: 'denied', reason: 'locked' });
    throw unauthorized('This account is locked. Please contact the administrator.');
  }
  await audit.record(null, { actorUserId: user.id, actorRole: user.role, action: 'auth.login', outcome: 'allowed' });
  return { user: { ...user.toSafeObject(), profile: publicProfile(user) }, ...issueTokens(user) };
};

const getCurrentUser = async (userId) => {
  const user = await db.User.findByPk(userId, { attributes: { exclude: ['password'] }, include: PROFILE_INCLUDES() });
  if (!user) throw new HttpError(404, 'User not found');
  return { ...user.toSafeObject(), profile: publicProfile(user) };
};

const refreshAccessToken = async (refreshToken) => {
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
  } catch {
    throw unauthorized('Invalid or expired refresh token');
  }
  const user = await db.User.findByPk(decoded.id, { include: PROFILE_INCLUDES() });
  if (!user || !user.isActive || (user.tokenVersion || 0) !== (decoded.tv || 0) ||
      user.doctorProfile?.isLocked || user.caregiverProfile?.isLocked) {
    throw unauthorized('Invalid or expired refresh token');
  }
  return { accessToken: generateAccessToken(user) };
};

/** Server-side logout: invalidates every access and refresh token of the user. */
const logout = async (user) => {
  await db.User.increment('tokenVersion', { where: { id: user.id } });
};

const requestPasswordReset = async (email) => {
  const normalizedEmail = String(email).trim().toLowerCase();
  const generic = { message: 'If the email exists, a reset link will be sent.' };
  const user = await db.User.findOne({ where: { email: normalizedEmail } });
  if (!user) return generic;

  const resetToken = crypto.randomBytes(32).toString('hex');
  await db.PasswordReset.update({ used: true }, { where: { email: normalizedEmail, used: false } });
  await db.PasswordReset.create({
    email: normalizedEmail,
    token: hashToken(resetToken),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    used: false
  });
  // There is no email transport yet (documented limitation). The raw token is
  // only exposed when a developer explicitly opts in on a non-production server.
  if (process.env.NODE_ENV !== 'production' && process.env.DEV_EXPOSE_RESET_TOKEN === 'true') {
    return { ...generic, resetToken };
  }
  return generic;
};

const resetPassword = async (token, newPassword) => {
  const record = await db.PasswordReset.findOne({ where: { token: hashToken(String(token)), used: false } });
  if (!record || record.isExpired()) throw new HttpError(400, 'Invalid or expired reset token');
  const user = await db.User.findOne({ where: { email: record.email } });
  if (!user) throw new HttpError(400, 'Invalid or expired reset token');
  await db.sequelize.transaction(async (transaction) => {
    user.password = newPassword;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save({ transaction });
    record.used = true;
    await record.save({ transaction });
  });
  await audit.record(null, { actorUserId: user.id, actorRole: user.role, action: 'auth.password_reset', outcome: 'allowed' });
  return { message: 'Password reset successful' };
};

module.exports = { register, login, getCurrentUser, refreshAccessToken, logout, requestPasswordReset, resetPassword, SELF_REGISTRABLE_ROLES };
