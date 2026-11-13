'use strict';
const crypto = require('crypto');
const path = require('path');

/**
 * Optional local sentence embeddings via transformers.js (ONNX, CPU).
 *
 * - Free and offline after a one-time model download (~23 MB for the default
 *   English model). No patient text is sent to a third party for embedding.
 * - EMBEDDINGS=off disables dense retrieval (lexical + contextual only).
 * - EMBEDDING_MODEL selects the model, e.g. a multilingual one for Urdu:
 *   'Xenova/paraphrase-multilingual-MiniLM-L12-v2'.
 * - If the library or model is unavailable, callers fall back to lexical
 *   retrieval; the failure is reported once, never thrown to the user.
 */
const MODEL = process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';
let extractorPromise = null;
let disabledReason = null;

function enabled() {
  if (process.env.EMBEDDINGS === 'off') return false;
  return !disabledReason;
}

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      env.cacheDir = process.env.MODEL_CACHE_DIR || path.join(__dirname, '..', '..', '.model-cache');
      if (process.env.HF_OFFLINE === 'true') env.allowRemoteModels = false;
      return pipeline('feature-extraction', MODEL, { dtype: 'q8' });
    })().catch(err => {
      disabledReason = err.message;
      console.warn(`[embeddings] disabled: ${err.message}`);
      return null;
    });
  }
  return extractorPromise;
}

/** @returns {Promise<number[][]|null>} L2-normalised vectors, or null if unavailable */
async function embed(texts) {
  if (!enabled() || !texts.length) return null;
  const ex = await getExtractor();
  if (!ex) return null;
  const out = await ex(texts, { pooling: 'mean', normalize: true });
  return out.tolist();
}

function cosine(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

const contentHash = (text) => crypto.createHash('sha256').update(`${MODEL}|${text}`).digest('hex');

module.exports = { embed, cosine, enabled, contentHash, MODEL, status: () => ({ model: MODEL, enabled: enabled(), disabledReason }) };
