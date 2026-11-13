'use strict';
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * JWT configuration.
 *
 * Audit S7: the original code fell back to hard-coded secrets, making tokens
 * forgeable whenever .env was missing. Now:
 *   • production: JWT_SECRET and JWT_REFRESH_SECRET are REQUIRED (min 32 chars);
 *   • development/test: if unset, a random per-process secret is generated
 *     (all sessions end when the server restarts) and a warning is printed.
 *
 * Tokens carry `typ` (access|refresh) so one cannot be used as the other, and
 * `tv` (the user's tokenVersion) so logout/password change revokes them.
 */
function resolveSecret(name) {
  const value = process.env[name];
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} must be set to a random string of at least 32 characters in production.`);
  }
  if (value) {
    console.warn(`[security] ${name} is shorter than 32 characters. Use a longer random value.`);
    return value;
  }
  if (process.env.NODE_ENV !== 'test') {
    console.warn(`[security] ${name} not set – using an ephemeral random secret (sessions reset on restart).`);
  }
  return crypto.randomBytes(48).toString('hex');
}

const JWT_SECRET = resolveSecret('JWT_SECRET');
const JWT_REFRESH_SECRET = resolveSecret('JWT_REFRESH_SECRET');
const JWT_EXPIRE = process.env.JWT_EXPIRE || '1h';
const JWT_REFRESH_EXPIRE = process.env.JWT_REFRESH_EXPIRE || '7d';
const ISSUER = 'vamora-api';

const generateAccessToken = (user) => jwt.sign(
  { id: user.id, role: user.role, tv: user.tokenVersion || 0, typ: 'access' },
  JWT_SECRET, { expiresIn: JWT_EXPIRE, issuer: ISSUER, algorithm: 'HS256' }
);

const generateRefreshToken = (user) => jwt.sign(
  { id: user.id, tv: user.tokenVersion || 0, typ: 'refresh' },
  JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRE, issuer: ISSUER, algorithm: 'HS256' }
);

function verify(token, secret, typ) {
  let decoded;
  try {
    decoded = jwt.verify(token, secret, { issuer: ISSUER, algorithms: ['HS256'] });
  } catch {
    throw new Error('Invalid or expired token');
  }
  if (decoded.typ !== typ) throw new Error('Invalid or expired token');
  return decoded;
}

const verifyAccessToken = (token) => verify(token, JWT_SECRET, 'access');
const verifyRefreshToken = (token) => verify(token, JWT_REFRESH_SECRET, 'refresh');

/** HMAC secret for short-lived signed media URLs (derived, never exposed). */
const MEDIA_URL_SECRET = crypto.createHmac('sha256', JWT_SECRET).update('vamora-media-url-v1').digest();

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  MEDIA_URL_SECRET
};
