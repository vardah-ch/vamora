'use strict';
const { BM25 } = require('./bm25');
const { tokenize, normalize, rawTokens, stem } = require('./text');
const embeddings = require('./embeddings');

/**
 * Context-aware personal-memory retrieval.
 *
 * Ranking combines three evidence sources with Reciprocal Rank Fusion
 * (Cormack, Clarke & Büttcher, 2009):
 *   1. lexical  – BM25 with a kinship/everyday-concept expansion lexicon;
 *   2. dense    – cosine similarity of local sentence embeddings (optional);
 *   3. context  – structured signals from the personal knowledge
 *                 representation: named people, memory type vs question
 *                 intent (who/where/when), and routine time vs current time.
 *
 * ABSTENTION: a document is only returned if at least one signal genuinely
 * supports it. When nothing qualifies the assistant says it does not know,
 * instead of answering from unrelated memories (the original behaviour).
 *
 * `rankDocuments` is pure (no DB, no network) so it can be evaluated offline;
 * see backend/eval/.
 */

const RRF_K = 60;
const DENSE_MIN = Number(process.env.DENSE_MIN_SIMILARITY) || 0.35; // selected on the dev set, see eval/README.md
const BONUS = { person: 0.02, intent: 0.008, routineNow: 0.016 };

const INTENTS = {
  who: /\b(who|whom|name|kaun)\b/i,
  where: /\b(where|place|kahan|kahaan)\b/i,
  when: /\b(when|date|year|kab)\b/i,
  now: /\b(now|today|tonight|this (morning|afternoon|evening)|routine|usually|every ?day|daily|should i (do|be)|supposed to|time (for|to)|next)\b/i
};

function detectIntents(query) {
  return Object.fromEntries(Object.entries(INTENTS).map(([k, re]) => [k, re.test(query)]));
}

function minutesOfDay(hhmm) {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** Text used for both lexical and dense representations of a document. */
function documentText(d) {
  return [d.title, d.people?.length ? `People: ${d.people.join(', ')}` : '', d.place ? `Place: ${d.place}` : '', d.text, d.category || '']
    .filter(Boolean).join('. ');
}

/**
 * @param {Array} docs   [{id, sourceType, type, title, text, people[], place, date, routineTime, category}]
 * @param {string} query
 * @param {object} opts  {k, now: Date, mode: 'hybrid'|'lexical'|'dense'|'recency', queryVector, docVectors: Map}
 */
function rankDocuments(docs, query, opts = {}) {
  // useContext / expansionWeight exist for ablation studies (eval/); production uses the defaults.
  const { k = 5, now = new Date(), queryVector = null, docVectors = new Map(), useContext = true, expansionWeight = 0.4 } = opts;
  let mode = opts.mode || 'hybrid';
  if ((mode === 'hybrid' || mode === 'dense') && !queryVector) mode = mode === 'dense' ? 'dense-unavailable' : 'lexical';

  if (mode === 'recency') {
    // Baseline reproducing the ORIGINAL system: the 20 most recent items, no relevance.
    const items = [...docs].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, k)
      .map((d, i) => ({ ...d, score: 1 / (RRF_K + i + 1), matched: ['recency'] }));
    return { mode, items };
  }

  const intents = detectIntents(query);
  const qRaw = new Set(rawTokens(query));
  const qTokens = new Set(tokenize(query));
  const signals = new Map(docs.map(d => [d.id, { lex: null, dense: null, bonus: 0, reasons: [] }]));

  // 1. Lexical
  if (mode === 'hybrid' || mode === 'lexical') {
    const bm25 = new BM25(docs.map(d => ({
      id: d.id,
      fields: [
        { text: d.title, weight: 2 },
        { text: (d.people || []).join(' '), weight: 2 },
        { text: d.place || '', weight: 1.5 },
        { text: d.text || '', weight: 1 },
        { text: d.category || '', weight: 0.5 }
      ]
    })), { expansionWeight });
    const lex = [...bm25.score(query).entries()].sort((a, b) => b[1].score - a[1].score);
    lex.forEach(([id, r], rank) => {
      const s = signals.get(id);
      s.lex = rank;
      s.reasons.push(...r.matched.map(t => `term:${t}`));
    });
  }

  // 2. Dense
  if ((mode === 'hybrid' || mode === 'dense') && queryVector) {
    const dense = docs.map(d => [d.id, docVectors.has(d.id) ? embeddings.cosine(queryVector, docVectors.get(d.id)) : -1])
      .filter(([, sim]) => sim >= DENSE_MIN)
      .sort((a, b) => b[1] - a[1]);
    dense.forEach(([id, sim], rank) => {
      const s = signals.get(id);
      s.dense = rank;
      s.reasons.push(`semantic:${sim.toFixed(2)}`);
    });
  }

  // 3. Context (all modes except recency)
  const nowMin = now.getHours() * 60 + now.getMinutes();
  for (const d of (useContext ? docs : [])) {
    const s = signals.get(d.id);
    const people = (d.people || []).map(p => normalize(p));
    const personHit = people.some(p => rawTokens(p).some(part => part.length > 2 && (qRaw.has(part) || qTokens.has(stem(part)))));
    if (personHit) { s.bonus += BONUS.person; s.reasons.push('person-mentioned'); }
    if (intents.who && (d.type === 'person' || people.length)) { s.bonus += BONUS.intent; s.reasons.push('intent:who'); }
    if (intents.where && (d.type === 'place' || d.place)) { s.bonus += BONUS.intent; s.reasons.push('intent:where'); }
    if (intents.when && (d.type === 'event' || d.eventDate)) { s.bonus += BONUS.intent; s.reasons.push('intent:when'); }
    if (intents.now && d.type === 'routine') {
      const rt = minutesOfDay(d.routineTime);
      if (rt !== null) {
        const gap = Math.min(Math.abs(rt - nowMin), 1440 - Math.abs(rt - nowMin));
        const closeness = gap <= 90 ? 1 : gap <= 180 ? 0.5 : 0;
        if (closeness > 0) { s.bonus += BONUS.routineNow * closeness; s.reasons.push(`routine-time:${d.routineTime}`); }
      }
    }
  }

  const items = [];
  for (const d of docs) {
    const s = signals.get(d.id);
    const supported = s.lex !== null || s.dense !== null || s.reasons.includes('person-mentioned') ||
      s.reasons.some(r => r.startsWith('routine-time'));
    if (!supported) continue; // abstain on intent-only matches
    const score = (s.lex !== null ? 1 / (RRF_K + s.lex + 1) : 0) + (s.dense !== null ? 1 / (RRF_K + s.dense + 1) : 0) + s.bonus;
    items.push({ ...d, score, matched: [...new Set(s.reasons)] });
  }
  items.sort((a, b) => b.score - a.score);
  return { mode, items: items.slice(0, k) };
}

// ── DB-backed retrieval ────────────────────────────────────────────────────

/** Load every retrievable unit for a patient (photos + memory items, not deleted). */
async function loadCorpus(patientUserId) {
  const db = require('../../models');
  const [photos, items] = await Promise.all([
    db.Photo.findAll({ where: { patientId: patientUserId, deletedAt: null } }),
    db.MemoryItem.findAll({ where: { patientUserId, deletedAt: null } })
  ]);
  return [
    ...photos.map(p => ({
      id: p.id, sourceType: 'photo', type: 'photo', title: p.caption, text: '', category: p.category,
      people: [], place: null, date: p.takenAt, eventDate: null, routineTime: null,
      confirmed: p.patientConfirmed, addedByUserId: p.uploadedByUserId, hasVoice: !!p.voiceNoteUrl
    })),
    ...items.map(m => ({
      id: m.id, sourceType: 'memory', type: m.type, title: m.title, text: m.content || '', category: m.type,
      people: m.people || [], place: m.place, date: m.eventDate || m.createdAt, eventDate: m.eventDate,
      routineTime: m.routineTime, confirmed: m.patientConfirmed, addedByUserId: m.createdByUserId, photoId: m.photoId
    }))
  ];
}

/** Embeddings for docs, cached in memory_index keyed by content hash + model. */
async function docVectorsFor(patientUserId, docs) {
  const db = require('../../models');
  const vectors = new Map();
  if (!embeddings.enabled() || !docs.length) return vectors;
  const texts = new Map(docs.map(d => [d.id, documentText(d)]));
  const cached = await db.MemoryIndex.findAll({ where: { patientUserId, model: embeddings.MODEL } });
  const byKey = new Map(cached.map(c => [`${c.sourceType}:${c.sourceId}`, c]));
  const missing = [];
  for (const d of docs) {
    const c = byKey.get(`${d.sourceType}:${d.id}`);
    if (c && c.contentHash === embeddings.contentHash(texts.get(d.id))) vectors.set(d.id, c.embedding);
    else missing.push(d);
  }
  if (missing.length) {
    const vecs = await embeddings.embed(missing.map(d => texts.get(d.id)));
    if (!vecs) return vectors;
    await Promise.all(missing.map(async (d, i) => {
      vectors.set(d.id, vecs[i]);
      const row = { patientUserId, sourceType: d.sourceType, sourceId: d.id, model: embeddings.MODEL, contentHash: embeddings.contentHash(texts.get(d.id)), embedding: vecs[i] };
      const existing = byKey.get(`${d.sourceType}:${d.id}`);
      if (existing) await existing.update(row); else await db.MemoryIndex.create(row).catch(() => {});
    }));
  }
  return vectors;
}

async function retrieve(patientUserId, query, { k = 5, now = new Date(), mode = 'hybrid' } = {}) {
  const docs = await loadCorpus(patientUserId);
  let queryVector = null; let docVectors = new Map();
  if ((mode === 'hybrid' || mode === 'dense') && embeddings.enabled()) {
    const [qv] = (await embeddings.embed([query])) || [];
    if (qv) { queryVector = qv; docVectors = await docVectorsFor(patientUserId, docs); }
  }
  return rankDocuments(docs, query, { k, now, mode, queryVector, docVectors });
}

module.exports = { rankDocuments, retrieve, loadCorpus, documentText, detectIntents, DENSE_MIN, RRF_K };
