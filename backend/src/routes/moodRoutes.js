'use strict';
const express = require('express');
const router = express.Router();
const { Mood } = require('../../models');
const { authenticate, authorize } = require('../middlewares/auth');
const NotificationService = require('../services/NotificationService');
const { badRequest } = require('../utils/http');

/**
 * Mood self-report. Base: /api/v1/moods (patient only)
 *
 * Audit A4: the mood camera used to save its facial-expression guess as the
 * patient's mood automatically, which then triggered caregiver alerts and fed
 * clinical dashboards. Now:
 *  - `source: 'manual'`            – the patient picked the mood.
 *  - `source: 'camera_confirmed'`  – the camera offered an expression ESTIMATE and
 *                                    the patient confirmed or corrected it. The
 *                                    estimate is stored separately in `inference`.
 *  - unconfirmed camera output is rejected by the API.
 */
const MOODS = ['happy', 'calm', 'sad', 'anxious', 'frustrated', 'tired', 'excited', 'confused'];
const ALARMING_MOODS = new Set(['sad', 'anxious', 'frustrated']);
const EXPRESSIONS = ['neutral', 'happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised'];

router.post('/', authenticate, authorize('patient'), async (req, res) => {
  const { mood, note } = req.body || {};
  const source = req.body?.source || 'manual';
  if (!MOODS.includes(mood)) throw badRequest('Please choose one of the moods shown.');
  if (!['manual', 'camera_confirmed'].includes(source)) {
    throw badRequest('Camera estimates must be confirmed by the person before they are saved.');
  }
  let inference = null;
  if (source === 'camera_confirmed' && req.body.inference) {
    const { expression, confidence } = req.body.inference;
    if (EXPRESSIONS.includes(expression)) {
      inference = {
        expression,
        confidence: Math.max(0, Math.min(100, Math.round(Number(confidence) || 0))),
        model: 'face-api.js TinyFaceDetector + FaceExpressionNet (browser)',
        agreedWithEstimate: req.body.inference.agreed === true
      };
    }
  }
  const entry = await Mood.create({
    patientId: req.user.id,
    mood,
    note: String(note || '').slice(0, 1000),
    source,
    inference,
    recordedAt: new Date()
  });
  if (ALARMING_MOODS.has(mood)) {
    NotificationService.sendMoodAlert(req.user.id, { mood }).catch(() => {});
  }
  res.json({ success: true, entry });
});

router.get('/', authenticate, authorize('patient'), async (req, res) => {
  const moods = await Mood.findAll({ where: { patientId: req.user.id }, order: [['recordedAt', 'DESC']], limit: 200 });
  res.json(moods);
});

module.exports = router;
module.exports.MOODS = MOODS;
