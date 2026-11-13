'use strict';
const { Op } = require('sequelize');
const db = require('../../models');
const ac = require('./accessControl');
const audit = require('./auditService');
const media = require('./mediaService');
const { badRequest, forbidden, notFound } = require('../utils/http');
const { discardUpload } = require('../middlewares/upload');
const NotificationService = require('./NotificationService');

/**
 * Personal memory library: photos (+ voice notes) and typed memory items.
 *
 * Visibility rules:
 *  - patient: everything of their own, including "recently removed" items.
 *  - memories.view: all active items.
 *  - memories.upload without memories.view: only items the viewer added.
 *  - Voice recordings additionally require voice.view (or being the uploader).
 *
 * Misuse controls (family-misuse scenarios in PRIVACY_AND_SECURITY.md):
 *  - provenance: every item records who added it; items added by someone else
 *    start as patientConfirmed=false and are labelled in the UI and to the AI;
 *  - deletion is soft for 30 days; the patient can restore, and is notified
 *    when anyone else removes something;
 *  - removing items added by others needs memories.delete, which the patient
 *    must grant explicitly.
 */

const RESTORE_WINDOW_DAYS = 30;
const PHOTO_CATEGORIES = ['family', 'home', 'pet', 'memory'];
const MEMORY_TYPES = ['written', 'person', 'place', 'event', 'routine'];

const isSelf = (req, patientUserId) => req.user.role === 'patient' && req.user.id === patientUserId;

async function displayName(userId) {
  const u = await db.User.findByPk(userId, {
    attributes: ['id', 'role'],
    include: [
      { model: db.Patient, as: 'patientProfile', attributes: ['name'] },
      { model: db.Caregiver, as: 'caregiverProfile', attributes: ['name'] },
      { model: db.Doctor, as: 'doctorProfile', attributes: ['name'] }
    ]
  });
  return u?.patientProfile?.name || u?.caregiverProfile?.name || u?.doctorProfile?.name || 'Someone';
}

async function visibilityWhere(req, patientUserId, ownerColumn) {
  const access = await ac.getAccess(req.user, patientUserId, req);
  if (access.permissions.has('memories.view')) return { access, where: {} };
  if (access.permissions.has('memories.upload')) return { access, where: { [ownerColumn]: req.user.id } };
  await ac.requirePermission(req, patientUserId, 'memories.view', 'memories.list');
  return null; // unreachable – requirePermission throws
}

// ── Photos ────────────────────────────────────────────────────────────────

async function listPhotos(req, patientUserId, { limit } = {}) {
  const { access, where } = await visibilityWhere(req, patientUserId, 'uploadedByUserId');
  const photos = await db.Photo.findAll({
    where: { patientId: patientUserId, deletedAt: null, ...where },
    order: [['takenAt', 'DESC']],
    ...(limit ? { limit } : {})
  });
  if (!isSelf(req, patientUserId)) {
    await audit.record(req, { action: 'photos.list', resourceType: 'photo', patientUserId, accessBasis: access.basis, grantId: access.grantId, reason: `${photos.length} items` });
  }
  const canHearVoice = access.permissions.has('voice.view');
  return photos.map(p => media.serializePhoto(p, req.user.id, { canHearVoice: canHearVoice || p.voiceUploadedByUserId === req.user.id }));
}

async function addPhoto(req, patientUserId) {
  try {
    const access = await ac.requirePermission(req, patientUserId, 'memories.upload', 'photo.upload');
    if (!req.file) throw badRequest('Photo file is required.');
    const caption = String(req.body.caption || '').trim();
    if (!caption) throw badRequest('Caption is required.');
    if (caption.length > 1000) throw badRequest('Caption is too long.');
    const category = req.body.category || 'memory';
    if (!PHOTO_CATEGORIES.includes(category)) throw badRequest(`Category must be one of: ${PHOTO_CATEGORIES.join(', ')}.`);
    const takenAt = req.body.takenAt && !Number.isNaN(Date.parse(req.body.takenAt)) ? new Date(req.body.takenAt) : new Date();

    const photo = await db.Photo.create({
      patientId: patientUserId,
      filename: req.file.filename,
      originalName: String(req.file.originalname || '').slice(0, 200),
      mimeType: req.file.detectedMime,
      caption, category, takenAt,
      uploadedByUserId: req.user.id,
      patientConfirmed: isSelf(req, patientUserId)
    });
    await audit.record(req, { action: 'photo.upload', resourceType: 'photo', resourceId: photo.id, patientUserId, accessBasis: access.basis, grantId: access.grantId });
    return media.serializePhoto(photo, req.user.id, { canHearVoice: true });
  } catch (e) {
    await discardUpload(req);
    throw e;
  }
}

async function loadPhoto(photoId, { includeDeleted = false } = {}) {
  const photo = await db.Photo.findByPk(photoId);
  if (!photo || (!includeDeleted && photo.deletedAt)) throw notFound('Photo not found.');
  return photo;
}

async function addVoiceNote(req, photoId) {
  try {
    const photo = await loadPhoto(photoId);
    const access = await ac.requirePermission(req, photo.patientId, 'voice.upload', 'voice.upload');
    if (!req.file) throw badRequest('Audio file is required.');
    await photo.update({
      voiceNoteUrl: req.file.filename,
      voiceNoteMime: req.file.detectedMime,
      voiceUploadedByUserId: req.user.id
    });
    await audit.record(req, { action: 'voice.upload', resourceType: 'photo', resourceId: photo.id, patientUserId: photo.patientId, accessBasis: access.basis, grantId: access.grantId });
    return { success: true, voiceUrl: media.signedUrl('voice', photo.id, req.user.id) };
  } catch (e) {
    await discardUpload(req);
    throw e;
  }
}

async function removePhoto(req, photoId) {
  const photo = await loadPhoto(photoId);
  const patientUserId = photo.patientId;
  const self = isSelf(req, patientUserId);
  const access = await ac.getAccess(req.user, patientUserId, req);
  const ownUpload = photo.uploadedByUserId === req.user.id && access.permissions.has('memories.upload');
  if (!self && !ownUpload && !access.permissions.has('memories.delete')) {
    await audit.record(req, { action: 'photo.delete', resourceType: 'photo', resourceId: photo.id, patientUserId, outcome: 'denied', reason: 'not owner and no memories.delete' });
    throw forbidden('Only the person, or someone they have allowed, can remove this memory.');
  }
  await photo.update({ deletedAt: new Date(), deletedByUserId: req.user.id });
  await audit.record(req, { action: 'photo.delete', resourceType: 'photo', resourceId: photo.id, patientUserId, accessBasis: access.basis, grantId: access.grantId });
  if (!self) {
    const who = await displayName(req.user.id);
    NotificationService.createNotification(patientUserId,
      `${who} removed the memory "${photo.caption.slice(0, 60)}". You can bring it back from "Recently removed" for ${RESTORE_WINDOW_DAYS} days.`,
      'memory_deleted').catch(() => {});
  }
  return { success: true, restorableUntil: new Date(Date.now() + RESTORE_WINDOW_DAYS * 864e5) };
}

async function listRemovedPhotos(req) {
  if (req.user.role !== 'patient') throw forbidden();
  const since = new Date(Date.now() - RESTORE_WINDOW_DAYS * 864e5);
  const photos = await db.Photo.findAll({
    where: { patientId: req.user.id, deletedAt: { [Op.gte]: since } },
    order: [['deletedAt', 'DESC']]
  });
  return photos.map(p => media.serializePhoto(p, req.user.id, { canHearVoice: true }));
}

async function restorePhoto(req, photoId) {
  const photo = await loadPhoto(photoId, { includeDeleted: true });
  if (!isSelf(req, photo.patientId)) throw forbidden('Only the person can restore their memories.');
  await photo.update({ deletedAt: null, deletedByUserId: null });
  await audit.record(req, { action: 'photo.restore', resourceType: 'photo', resourceId: photo.id, patientUserId: photo.patientId });
  return media.serializePhoto(photo, req.user.id, { canHearVoice: true });
}

async function confirmPhoto(req, photoId) {
  const photo = await loadPhoto(photoId);
  if (!isSelf(req, photo.patientId)) throw forbidden('Only the person can confirm their own memories.');
  await photo.update({ patientConfirmed: req.body?.confirmed !== false });
  await audit.record(req, { action: 'photo.confirm', resourceType: 'photo', resourceId: photo.id, patientUserId: photo.patientId });
  return media.serializePhoto(photo, req.user.id, { canHearVoice: true });
}

// ── Memory items ──────────────────────────────────────────────────────────

function cleanMemoryInput(body, { partial = false } = {}) {
  const out = {};
  if (!partial || body.type !== undefined) {
    const type = body.type || 'written';
    if (!MEMORY_TYPES.includes(type)) throw badRequest(`Type must be one of: ${MEMORY_TYPES.join(', ')}.`);
    out.type = type;
  }
  if (!partial || body.title !== undefined) {
    const title = String(body.title || '').trim();
    if (!title || title.length > 200) throw badRequest('A short title (up to 200 characters) is required.');
    out.title = title;
  }
  if (body.content !== undefined) {
    const content = String(body.content || '').trim();
    if (content.length > 5000) throw badRequest('Description is too long.');
    out.content = content || null;
  }
  if (body.people !== undefined) {
    const people = Array.isArray(body.people) ? body.people : String(body.people).split(',');
    out.people = people.map(p => String(p).trim()).filter(Boolean).slice(0, 20).map(p => p.slice(0, 100));
  }
  if (body.place !== undefined) out.place = String(body.place || '').trim().slice(0, 200) || null;
  if (body.eventDate !== undefined) {
    if (body.eventDate && Number.isNaN(Date.parse(body.eventDate))) throw badRequest('Invalid date.');
    out.eventDate = body.eventDate || null;
  }
  if (body.routineTime !== undefined) {
    if (body.routineTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.routineTime)) throw badRequest('Time must look like 08:30.');
    out.routineTime = body.routineTime || null;
  }
  return out;
}

async function listMemoryItems(req, patientUserId) {
  const { access, where } = await visibilityWhere(req, patientUserId, 'createdByUserId');
  const items = await db.MemoryItem.findAll({
    where: { patientUserId, deletedAt: null, ...where },
    order: [['type', 'ASC'], ['createdAt', 'DESC']]
  });
  if (!isSelf(req, patientUserId)) {
    await audit.record(req, { action: 'memories.list', resourceType: 'memory_item', patientUserId, accessBasis: access.basis, grantId: access.grantId, reason: `${items.length} items` });
  }
  return items;
}

async function createMemoryItem(req, patientUserId) {
  const access = await ac.requirePermission(req, patientUserId, 'memories.upload', 'memory.create');
  const data = cleanMemoryInput(req.body || {});
  const item = await db.MemoryItem.create({
    ...data, patientUserId, createdByUserId: req.user.id, patientConfirmed: isSelf(req, patientUserId)
  });
  await audit.record(req, { action: 'memory.create', resourceType: 'memory_item', resourceId: item.id, patientUserId, accessBasis: access.basis, grantId: access.grantId });
  return item;
}

async function loadItem(id) {
  const item = await db.MemoryItem.findByPk(id);
  if (!item || item.deletedAt) throw notFound('Memory not found.');
  return item;
}

async function updateMemoryItem(req, id) {
  const item = await loadItem(id);
  const self = isSelf(req, item.patientUserId);
  const access = await ac.getAccess(req.user, item.patientUserId, req);
  if (!self && !(item.createdByUserId === req.user.id && access.permissions.has('memories.upload'))) {
    await audit.record(req, { action: 'memory.update', resourceType: 'memory_item', resourceId: id, patientUserId: item.patientUserId, outcome: 'denied' });
    throw forbidden('You can only edit memories you added.');
  }
  const data = cleanMemoryInput(req.body || {}, { partial: true });
  // An edit by someone else means the patient has not confirmed the new version.
  if (!self) data.patientConfirmed = false;
  await item.update(data);
  await audit.record(req, { action: 'memory.update', resourceType: 'memory_item', resourceId: id, patientUserId: item.patientUserId, accessBasis: access.basis });
  return item;
}

async function confirmMemoryItem(req, id) {
  const item = await loadItem(id);
  if (!isSelf(req, item.patientUserId)) throw forbidden('Only the person can confirm their own memories.');
  await item.update({ patientConfirmed: req.body?.confirmed !== false });
  await audit.record(req, { action: 'memory.confirm', resourceType: 'memory_item', resourceId: id, patientUserId: item.patientUserId });
  return item;
}

async function removeMemoryItem(req, id) {
  const item = await loadItem(id);
  const self = isSelf(req, item.patientUserId);
  const access = await ac.getAccess(req.user, item.patientUserId, req);
  const own = item.createdByUserId === req.user.id && access.permissions.has('memories.upload');
  if (!self && !own && !access.permissions.has('memories.delete')) {
    await audit.record(req, { action: 'memory.delete', resourceType: 'memory_item', resourceId: id, patientUserId: item.patientUserId, outcome: 'denied' });
    throw forbidden('Only the person, or someone they have allowed, can remove this memory.');
  }
  await item.update({ deletedAt: new Date(), deletedByUserId: req.user.id });
  await audit.record(req, { action: 'memory.delete', resourceType: 'memory_item', resourceId: id, patientUserId: item.patientUserId, accessBasis: access.basis });
  if (!self) {
    const who = await displayName(req.user.id);
    NotificationService.createNotification(item.patientUserId,
      `${who} removed the memory "${item.title.slice(0, 60)}". You can bring it back for ${RESTORE_WINDOW_DAYS} days.`, 'memory_deleted').catch(() => {});
  }
  return { success: true };
}

async function restoreMemoryItem(req, id) {
  const item = await db.MemoryItem.findByPk(id);
  if (!item) throw notFound('Memory not found.');
  if (!isSelf(req, item.patientUserId)) throw forbidden('Only the person can restore their memories.');
  await item.update({ deletedAt: null, deletedByUserId: null });
  await audit.record(req, { action: 'memory.restore', resourceType: 'memory_item', resourceId: id, patientUserId: item.patientUserId });
  return item;
}

module.exports = {
  PHOTO_CATEGORIES, MEMORY_TYPES, RESTORE_WINDOW_DAYS,
  listPhotos, addPhoto, addVoiceNote, removePhoto, listRemovedPhotos, restorePhoto, confirmPhoto, loadPhoto,
  listMemoryItems, createMemoryItem, updateMemoryItem, confirmMemoryItem, removeMemoryItem, restoreMemoryItem,
  displayName, isSelf
};
