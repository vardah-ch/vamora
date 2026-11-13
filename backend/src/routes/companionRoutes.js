'use strict';
const express = require('express');
const router = express.Router();
const db = require('../../models');
const { authenticate, authorize } = require('../middlewares/auth');
const companion = require('../ai/companion');
const media = require('../services/mediaService');
const audit = require('../services/auditService');
const NotificationService = require('../services/NotificationService');
const { badRequest } = require('../utils/http');

/**
 * Cara companion. Base: /api/v1/companion (patient only)
 * See src/ai/companion.js for the grounded pipeline and AI_METHODOLOGY.md.
 */

router.post('/chat', authenticate, authorize('patient'), async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message) throw badRequest('Message is required.');
  if (message.length > 1000) throw badRequest('That message is a little long. Could you say it in fewer words?');

  const patientUserId = req.user.id;
  const profile = await db.Patient.findOne({ where: { userId: patientUserId } });
  const patientName = profile?.name?.split(' ')[0] || 'friend';
  const history = (await db.ChatMessage.findAll({
    where: { patientId: patientUserId }, order: [['createdAt', 'DESC']], limit: 6
  })).reverse();

  await db.ChatMessage.create({ patientId: patientUserId, role: 'user', content: message });

  const result = await companion.respond({
    patientUserId, patientName, message,
    history: history.map(h => ({ role: h.role, content: h.content })),
    onUrgent: async () => {
      const n = await NotificationService.sendHelpRequest(patientUserId);
      await audit.record(req, { action: 'companion.help_request', patientUserId, reason: `notified ${n}` });
    }
  });

  // Photo sources get a signed thumbnail URL so the patient can RECOGNISE the memory.
  const sources = result.sources.map(s => ({ ...s, url: s.sourceType === 'photo' ? media.signedUrl('photo', s.id, req.user.id) : null }));

  await db.ChatMessage.create({
    patientId: patientUserId, role: 'assistant', content: result.reply,
    metadata: { sources: result.sources, grounding: result.grounding }
  });

  res.json({ reply: result.reply, sources, grounding: result.grounding });
});

router.get('/history', authenticate, authorize('patient'), async (req, res) => {
  const messages = await db.ChatMessage.findAll({
    where: { patientId: req.user.id }, order: [['createdAt', 'DESC']], limit: 50
  });
  res.json(messages.reverse().map(m => ({
    id: m.id, role: m.role, content: m.content, createdAt: m.createdAt,
    sources: (m.metadata?.sources || []).map(s => ({ ...s, url: s.sourceType === 'photo' ? media.signedUrl('photo', s.id, req.user.id) : null })),
    groundingStatus: m.metadata?.grounding?.status || null
  })));
});

/** The patient can clear their own conversation history (right to erasure). */
router.delete('/history', authenticate, authorize('patient'), async (req, res) => {
  const n = await db.ChatMessage.destroy({ where: { patientId: req.user.id } });
  await audit.record(req, { action: 'companion.history.clear', patientUserId: req.user.id, reason: `${n} messages` });
  res.json({ success: true, deleted: n });
});

module.exports = router;
