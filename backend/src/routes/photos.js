'use strict';
const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middlewares/auth');
const { imageUpload, audioUpload } = require('../middlewares/upload');
const lib = require('../services/memoryLibrary');
const { parseUuid } = require('../utils/http');

/**
 * Patient's own photo library. Base: /api/v1/photos
 * Caregiver access to a patient's photos lives under /api/v1/caregiver.
 * Voice notes and deletion work for any authorised role (checked per photo).
 */
const patientOnly = [authenticate, authorize('patient')];

router.get('/', ...patientOnly, async (req, res) => {
  res.json(await lib.listPhotos(req, req.user.id));
});

router.post('/', ...patientOnly, ...imageUpload('photo'), async (req, res) => {
  res.status(201).json({ success: true, photo: await lib.addPhoto(req, req.user.id) });
});

router.get('/removed', ...patientOnly, async (req, res) => {
  res.json(await lib.listRemovedPhotos(req));
});

router.post('/:id/restore', ...patientOnly, async (req, res) => {
  res.json(await lib.restorePhoto(req, parseUuid(req.params.id)));
});

router.post('/:id/confirm', ...patientOnly, async (req, res) => {
  res.json(await lib.confirmPhoto(req, parseUuid(req.params.id)));
});

router.post('/:id/voice', authenticate, ...audioUpload('voice'), async (req, res) => {
  res.json(await lib.addVoiceNote(req, parseUuid(req.params.id)));
});

router.delete('/:id', authenticate, async (req, res) => {
  res.json(await lib.removePhoto(req, parseUuid(req.params.id)));
});

module.exports = router;
