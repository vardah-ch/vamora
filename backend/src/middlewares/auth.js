'use strict';
const { verifyAccessToken } = require('../config/jwt');
const db = require('../../models');

/**
 * Authenticate a request with a Bearer access token.
 * Rejects: missing/invalid/expired tokens, refresh tokens used as access
 * tokens, revoked tokens (tokenVersion mismatch), inactive accounts, and
 * locked doctor/caregiver accounts (audit B3 – the lock flag was previously
 * stored but never enforced).
 */
const authenticate = async (req, res, next) => {
  const fail = (message) => res.status(401).json({ status: 'error', message, error: message });
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return fail('Authentication required. Please provide a token.');
  }
  let decoded;
  try {
    decoded = verifyAccessToken(authHeader.slice(7));
  } catch {
    return fail('Invalid or expired token.');
  }
  try {
    const user = await db.User.findByPk(decoded.id, {
      attributes: { exclude: ['password'] },
      include: [
        { model: db.Doctor, as: 'doctorProfile', attributes: ['isLocked'] },
        { model: db.Caregiver, as: 'caregiverProfile', attributes: ['isLocked'] }
      ]
    });
    if (!user) return fail('User not found or has been deleted.');
    if ((user.tokenVersion || 0) !== (decoded.tv || 0)) return fail('Session has ended. Please sign in again.');
    if (!user.isActive) return fail('Account is inactive. Please contact support.');
    if (user.doctorProfile?.isLocked || user.caregiverProfile?.isLocked) {
      return fail('This account is locked. Please contact the administrator.');
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

/** Allow only the listed roles. Must follow `authenticate`. */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ status: 'error', message: 'Authentication required.' });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ status: 'error', message: 'Access denied. Insufficient permissions.', error: 'Access denied.' });
  }
  next();
};

const requireSuperAdmin = authorize('super_admin');

module.exports = { authenticate, authorize, requireSuperAdmin };
