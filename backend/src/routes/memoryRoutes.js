'use strict';
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const lib = require('../services/memoryLibrary');
const ac = require('../services/accessControl');
const retriever = require('../ai/retriever');
const { parseId, parseUuid, badRequest } = require('../utils/http');

/**
 * Typed personal memories (written memories, people, places, events, routines).
 * Base: /api/v1/memories
 * `patientId` (patients.id) selects the patient for caregivers/doctors;
 * patients always act on their own library.
 */
async function subjectUserId(req) {
  if (req.user.role === 'patient') return req.user.id;
  const raw = req.query.patientId ?? req.body?.patientId;
  if (raw === undefined) throw badRequest('patientId is required.');
  const patient = await ac.resolvePatientById(parseId(raw, 'patientId'));
  return patient.userId;
}

router.get('/', authenticate, async (req, res) => {
  res.json(await lib.listMemoryItems(req, await subjectUserId(req)));
});

router.post('/', authenticate, async (req, res) => {
  res.status(201).json(await lib.createMemoryItem(req, await subjectUserId(req)));
});

/**
 * Explain what the assistant would retrieve for a question, without calling
 * the LLM. Lets patients and permitted caregivers see *why* a memory is used.
 */
router.get('/search', authenticate, async (req, res) => {
  const patientUserId = await subjectUserId(req);
  await ac.requirePermission(req, patientUserId, 'memories.view', 'memories.search');
  const q = String(req.query.q || '').slice(0, 500);
  if (!q.trim()) throw badRequest('Please type a question.');
  const result = await retriever.retrieve(patientUserId, q, { k: Math.min(Number(req.query.k) || 5, 10) });
  res.json({
    query: q,
    mode: result.mode,
    results: result.items.map(r => ({ id: r.id, sourceType: r.sourceType, title: r.title, score: Number(r.score.toFixed(4)), matched: r.matched }))
  });
});

router.patch('/:id', authenticate, async (req, res) => {
  res.json(await lib.updateMemoryItem(req, parseUuid(req.params.id)));
});

router.post('/:id/confirm', authenticate, async (req, res) => {
  res.json(await lib.confirmMemoryItem(req, parseUuid(req.params.id)));
});

router.post('/:id/restore', authenticate, async (req, res) => {
  res.json(await lib.restoreMemoryItem(req, parseUuid(req.params.id)));
});

router.delete('/:id', authenticate, async (req, res) => {
  res.json(await lib.removeMemoryItem(req, parseUuid(req.params.id)));
});

module.exports = router;
