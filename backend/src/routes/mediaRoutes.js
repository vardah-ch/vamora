'use strict';
const express = require('express');
const fs = require('fs');
const router = express.Router();
const db = require('../../models');
const mediaService = require('../services/mediaService');
const ac = require('../services/accessControl');
const audit = require('../services/auditService');
const { resolveStoredFile } = require('../middlewares/upload');

/**
 * Authorised media streaming (audit S6). Base: /api/v1/media
 *   GET /photo/:id?u&e&s   GET /voice/:id?u&e&s
 * The signature identifies the viewer; permission is re-checked on every
 * fetch so revocations apply immediately. Responses are never publicly
 * cacheable. Every non-self access is audited.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const deny = (res, code = 404) => res.status(code).json({ status: 'error', message: 'Not available.' });

async function serve(kind, req, res) {
  const photoId = req.params.id;
  if (!UUID_RE.test(photoId)) return deny(res);
  const viewerId = mediaService.verify(kind, photoId, req.query);
  if (!viewerId) return deny(res, 403);

  const viewer = await db.User.findByPk(viewerId, {
    attributes: ['id', 'role', 'isActive'],
    include: [
      { model: db.Doctor, as: 'doctorProfile', attributes: ['isLocked'] },
      { model: db.Caregiver, as: 'caregiverProfile', attributes: ['isLocked'] }
    ]
  });
  if (!viewer || !viewer.isActive || viewer.doctorProfile?.isLocked || viewer.caregiverProfile?.isLocked) return deny(res, 403);

  const photo = await db.Photo.findByPk(photoId);
  if (!photo) return deny(res);
  const self = viewer.role === 'patient' && viewer.id === photo.patientId;
  const ctx = { user: viewer, id: req.id };
  const access = await ac.getAccess(viewer, photo.patientId, ctx);

  let allowed;
  if (photo.deletedAt) allowed = self;
  else if (kind === 'photo') {
    allowed = access.permissions.has('memories.view') ||
      (access.permissions.has('memories.upload') && photo.uploadedByUserId === viewer.id);
  } else {
    allowed = !!photo.voiceNoteUrl && (access.permissions.has('voice.view') ||
      (access.permissions.has('voice.upload') && photo.voiceUploadedByUserId === viewer.id));
  }
  if (!allowed) {
    await audit.record(ctx, { action: `media.${kind}.view`, resourceType: 'photo', resourceId: photo.id, patientUserId: photo.patientId, outcome: 'denied', accessBasis: access.basis });
    return deny(res, 403);
  }

  const file = resolveStoredFile(kind === 'photo' ? photo.filename : photo.voiceNoteUrl);
  if (!file || !fs.existsSync(file)) return deny(res);
  if (!self) {
    await audit.record(ctx, { action: `media.${kind}.view`, resourceType: 'photo', resourceId: photo.id, patientUserId: photo.patientId, accessBasis: access.basis, grantId: access.grantId });
  }
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('Content-Disposition', 'inline');
  const mime = kind === 'photo' ? photo.mimeType : photo.voiceNoteMime;
  if (mime) res.type(mime);
  res.sendFile(file);
}

router.get('/photo/:id', (req, res, next) => serve('photo', req, res).catch(next));
router.get('/voice/:id', (req, res, next) => serve('voice', req, res).catch(next));

module.exports = router;
