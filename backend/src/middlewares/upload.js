'use strict';
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { badRequest } = require('../utils/http');

/**
 * Upload handling (audit S6, S12).
 *  - Files are written to a PRIVATE directory (UPLOAD_PATH, default ./uploads)
 *    that is no longer served statically; they are only reachable through
 *    authorised, signed media URLs (see services/mediaService.js).
 *  - The client-declared MIME type is only a first filter. After upload the
 *    file's magic bytes are checked; files that are not genuinely one of the
 *    allowed formats are deleted and rejected. SVG/HTML are never accepted.
 *  - Stored names are random; the extension comes from the detected type,
 *    never from the user-supplied filename.
 */
const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_PATH || path.join(__dirname, '..', '..', 'uploads'));
const PHOTO_DIR = path.join(UPLOAD_ROOT, 'photos');
const MAX_BYTES = Number(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024;
fs.mkdirSync(PHOTO_DIR, { recursive: true });

const ascii = (b, start, end) => b.subarray(start, end).toString('latin1');

const SIGNATURES = {
  image: [
    { mime: 'image/jpeg', ext: '.jpg', test: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
    { mime: 'image/png', ext: '.png', test: b => b[0] === 0x89 && ascii(b, 1, 4) === 'PNG' },
    { mime: 'image/gif', ext: '.gif', test: b => ascii(b, 0, 4) === 'GIF8' },
    { mime: 'image/webp', ext: '.webp', test: b => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP' }
  ],
  audio: [
    { mime: 'audio/webm', ext: '.webm', test: b => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
    { mime: 'audio/ogg', ext: '.ogg', test: b => ascii(b, 0, 4) === 'OggS' },
    { mime: 'audio/wav', ext: '.wav', test: b => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WAVE' },
    { mime: 'audio/mpeg', ext: '.mp3', test: b => ascii(b, 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
    { mime: 'audio/mp4', ext: '.m4a', test: b => ascii(b, 4, 8) === 'ftyp' }
  ]
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, PHOTO_DIR),
  filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}.upload`)
});

function makeUploader(kind) {
  const prefix = kind === 'image' ? 'image/' : 'audio/';
  return multer({
    storage,
    limits: { fileSize: MAX_BYTES, files: 1 },
    fileFilter: (req, file, cb) => {
      const type = String(file.mimetype || '');
      // Browsers record MediaRecorder audio as video/webm in some versions.
      const ok = type.startsWith(prefix) || (kind === 'audio' && type === 'video/webm');
      if (!ok || /svg|html|xml/i.test(type)) {
        return cb(badRequest(kind === 'image'
          ? 'Please choose a photo (JPEG, PNG, GIF or WebP).'
          : 'Please choose an audio recording.'));
      }
      cb(null, true);
    }
  });
}

/** After multer: verify magic bytes, rename with the detected extension. */
function verifyStoredFile(kind) {
  return async (req, res, next) => {
    if (!req.file) return next();
    try {
      const fd = await fs.promises.open(req.file.path, 'r');
      const header = Buffer.alloc(16);
      await fd.read(header, 0, 16, 0);
      await fd.close();
      const match = SIGNATURES[kind].find(s => s.test(header));
      if (!match) {
        await fs.promises.unlink(req.file.path).catch(() => {});
        return next(badRequest('The file content does not match an allowed format.'));
      }
      const finalName = req.file.filename.replace(/\.upload$/, match.ext);
      const finalPath = path.join(PHOTO_DIR, finalName);
      await fs.promises.rename(req.file.path, finalPath);
      req.file.filename = finalName;
      req.file.path = finalPath;
      req.file.detectedMime = match.mime;
      if (DB_STORE) await saveToDb(finalName, match.mime, finalPath);
      next();
    } catch (e) {
      next(e);
    }
  };
}

/**
 * MEDIA_STORE=db keeps file bytes in PostgreSQL (table media_blobs) instead of
 * on local disk. Needed on serverless hosts whose filesystem is temporary.
 * Access control is unchanged: bytes are only served through /api/v1/media.
 */
const DB_STORE = process.env.MEDIA_STORE === 'db';
async function saveToDb(name, mime, filePath) {
  const db = require('../../models');
  const data = await fs.promises.readFile(filePath);
  await db.sequelize.query(
    'INSERT INTO media_blobs (name, mime, data, created_at) VALUES (:name, :mime, :data, NOW())',
    { replacements: { name, mime, data } }
  );
  await fs.promises.unlink(filePath).catch(() => {});
}
async function loadFromDb(storedName) {
  if (!DB_STORE || !storedName) return null;
  const db = require('../../models');
  const [row] = await db.sequelize.query('SELECT mime, data FROM media_blobs WHERE name = :name LIMIT 1',
    { replacements: { name: path.basename(String(storedName)) }, type: db.sequelize.QueryTypes.SELECT });
  return row || null;
}

const imageUpload = (field) => [makeUploader('image').single(field), verifyStoredFile('image')];
const audioUpload = (field) => [makeUploader('audio').single(field), verifyStoredFile('audio')];

/** Map a stored filename (legacy rows may hold "/uploads/photos/x.jpg") to a safe absolute path. */
function resolveStoredFile(storedName) {
  if (!storedName) return null;
  const base = path.basename(String(storedName));
  if (!base || base.startsWith('.')) return null;
  const full = path.join(PHOTO_DIR, base);
  return full.startsWith(PHOTO_DIR + path.sep) ? full : null;
}

/** Remove a just-uploaded file when the request fails after upload. */
async function discardUpload(req) {
  if (req.file?.path) await fs.promises.unlink(req.file.path).catch(() => {});
}

module.exports = { imageUpload, audioUpload, resolveStoredFile, loadFromDb, discardUpload, PHOTO_DIR, UPLOAD_ROOT };
