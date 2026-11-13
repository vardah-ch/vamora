'use strict';
const crypto = require('crypto');
const { MEDIA_URL_SECRET } = require('../config/jwt');

/**
 * Short-lived signed media URLs (audit S6).
 *
 * Media is never served from a public static folder. When an authorised user
 * lists photos, the API returns URLs of the form
 *   /api/v1/media/<kind>/<photoId>?u=<viewerUserId>&e=<expiry>&s=<hmac>
 * The HMAC binds photo, media kind, viewer and expiry, so a URL cannot be
 * guessed, altered to point at another file, or reused after it expires.
 * Permission is checked when the URL is issued AND re-checked when it is
 * fetched, so revoking access takes effect immediately.
 */
const TTL_SECONDS = Number(process.env.MEDIA_URL_TTL_SECONDS) || 600;
const API_PREFIX = '/api/v1/media';

function sign(kind, photoId, userId, exp) {
  return crypto.createHmac('sha256', MEDIA_URL_SECRET)
    .update(`${kind}|${photoId}|${userId}|${exp}`).digest('base64url');
}

function signedUrl(kind, photoId, userId) {
  const exp = Math.floor(Date.now() / 1000) + TTL_SECONDS;
  return `${API_PREFIX}/${kind}/${photoId}?u=${userId}&e=${exp}&s=${sign(kind, photoId, userId, exp)}`;
}

/** @returns {number|null} the viewer's users.id if the signature is valid and unexpired */
function verify(kind, photoId, query) {
  const userId = Number(query.u);
  const exp = Number(query.e);
  const sig = String(query.s || '');
  if (!Number.isInteger(userId) || !Number.isInteger(exp)) return null;
  if (exp < Math.floor(Date.now() / 1000)) return null;
  const expected = Buffer.from(sign(kind, photoId, userId, exp));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  return userId;
}

/** Serialize a Photo for API output, attaching signed URLs only for what the viewer may see. */
function serializePhoto(photo, viewerUserId, { canHearVoice = false } = {}) {
  const p = photo.toJSON ? photo.toJSON() : photo;
  return {
    id: p.id,
    patientId: p.patientId,
    caption: p.caption,
    category: p.category,
    takenAt: p.takenAt,
    createdAt: p.createdAt,
    uploadedByUserId: p.uploadedByUserId,
    patientConfirmed: p.patientConfirmed,
    deletedAt: p.deletedAt,
    url: signedUrl('photo', p.id, viewerUserId),
    hasVoiceNote: !!p.voiceNoteUrl,
    voiceUrl: p.voiceNoteUrl && canHearVoice ? signedUrl('voice', p.id, viewerUserId) : null
  };
}

module.exports = { signedUrl, verify, serializePhoto, TTL_SECONDS };
