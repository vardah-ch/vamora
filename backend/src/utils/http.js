'use strict';
const crypto = require('crypto');

/** Error carrying an HTTP status. Messages of 4xx errors are shown to clients. */
class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const badRequest = (m, c) => new HttpError(400, m, c || 'bad_request');
const forbidden = (m = 'You do not have permission to do this.', c) => new HttpError(403, m, c || 'forbidden');
const notFound = (m = 'Not found.', c) => new HttpError(404, m, c || 'not_found');
const conflict = (m, c) => new HttpError(409, m, c || 'conflict');

function requestId(req, res, next) {
  req.id = crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}

/**
 * Central error handler (audit S10). 4xx: the message is safe to show.
 * 5xx: a generic message plus a request id; details go to the server log only
 * (no request bodies, which may contain patient information).
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || err.statusCode || 500;
  let message = err.message;
  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    status = 400;
    message = err.errors?.[0]?.message || 'Invalid input.';
  } else if (err.type === 'entity.too.large') {
    status = 413; message = 'Request is too large.';
  } else if (err.code === 'LIMIT_FILE_SIZE') {
    status = 413; message = 'File is too large.';
  } else if (err.type === 'entity.parse.failed') {
    status = 400; message = 'Malformed JSON.';
  }
  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.route?.path || req.path} id=${req.id} ${err.name}: ${err.message}`);
    message = 'Something went wrong. Please try again.';
  }
  res.status(status).json({ status: 'error', message, error: message, code: err.code, requestId: req.id });
}

/** Strict positive integer parsing for route params. */
function parseId(value, label = 'id') {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw badRequest(`Invalid ${label}.`);
  return n;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function parseUuid(value, label = 'id') {
  if (typeof value !== 'string' || !UUID_RE.test(value)) throw badRequest(`Invalid ${label}.`);
  return value;
}

/** Strong random password for accounts created on someone's behalf (audit S13). */
function generateTemporaryPassword() {
  // 12 chars from an unambiguous alphabet (~70 bits) plus a digit guarantee.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out + String(crypto.randomInt(10, 99));
}

module.exports = { HttpError, badRequest, forbidden, notFound, conflict, requestId, errorHandler, parseId, parseUuid, generateTemporaryPassword };
