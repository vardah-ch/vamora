'use strict';

/**
 * Descriptive care metrics with honest labelling.
 *
 * - Only SELF-REPORTED moods (manual or patient-confirmed camera) are counted.
 *   Legacy unconfirmed camera rows are shown but never scored or alerted on.
 * - The "wellness score" is kept for continuity of the existing dashboards but
 *   is explicitly a *self-reported mood average*, not a validated measure.
 * - MMSE: a single score is never labelled "Declining". Trend requires at
 *   least two scores; bands follow commonly used, non-diagnostic cut-offs.
 */
const MOOD_SCORES = { happy: 10, excited: 10, calm: 8, tired: 5, confused: 4, anxious: 3, frustrated: 3, sad: 2 };
const ALARMING = new Set(['sad', 'anxious', 'frustrated']);
const SELF_REPORTED = new Set(['manual', 'camera_confirmed']);

const selfReported = (moods) => (moods || []).filter(m => SELF_REPORTED.has(m.source || 'manual'));

function moodAverage(moods) {
  const sr = selfReported(moods);
  if (!sr.length) return null;
  return Math.round(sr.reduce((s, m) => s + (MOOD_SCORES[m.mood] || 5), 0) / sr.length);
}

function isToday(date) {
  const d = new Date(date); const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

function lowMoodToday(moods) {
  const latest = selfReported(moods)[0];
  return !!latest && isToday(latest.recordedAt) && ALARMING.has(latest.mood);
}

function mmseBand(score) {
  if (score === null || score === undefined) return null;
  if (score >= 24) return '24–30';
  if (score >= 18) return '18–23';
  return '0–17';
}

/** @param scores ascending by assessmentDate */
function mmseTrend(scores) {
  if (!scores || scores.length < 2) return null;
  const last = scores[scores.length - 1].score;
  const prev = scores[scores.length - 2].score;
  const delta = last - prev;
  // Changes of ±2 or less are within commonly reported test–retest variability.
  return { delta, direction: delta <= -3 ? 'lower' : delta >= 3 ? 'higher' : 'similar' };
}

const METRIC_NOTE = 'Self-reported mood average (0–10). Not a clinical measure.';

module.exports = { MOOD_SCORES, selfReported, moodAverage, lowMoodToday, mmseBand, mmseTrend, METRIC_NOTE, isToday };
