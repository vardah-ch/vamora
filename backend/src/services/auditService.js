'use strict';
const db = require('../../models');

/**
 * Append-only audit trail (audit S14). Records WHO did WHAT to WHICH resource,
 * for WHICH patient, WHEN, on WHAT basis and whether it was allowed.
 * Deliberately never stores content (captions, notes, chat text, media).
 * Logging failures never break the user's request.
 */
async function record(req, event) {
  try {
    await db.AuditEvent.create({
      actorUserId: req?.user?.id ?? event.actorUserId ?? null,
      actorRole: req?.user?.role ?? event.actorRole ?? null,
      action: event.action,
      resourceType: event.resourceType || null,
      resourceId: event.resourceId != null ? String(event.resourceId).slice(0, 64) : null,
      patientUserId: event.patientUserId ?? null,
      outcome: event.outcome || 'allowed',
      reason: event.reason ? String(event.reason).slice(0, 200) : null,
      accessBasis: event.accessBasis || null,
      grantId: event.grantId || null,
      requestId: req?.id || null
    });
  } catch (e) {
    console.error(`[audit] failed to record ${event.action}: ${e.message}`);
  }
}

module.exports = { record };
