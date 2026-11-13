'use strict';

/**
 * Thin, defensive wrapper around the Groq chat-completions API.
 *  - Model is configurable (GROQ_MODEL); default llama-3.3-70b-versatile.
 *  - Hard timeout, one retry on 429/5xx/network errors with backoff.
 *  - Never logs prompts or replies (they contain patient information).
 *  - Returns null when no API key is configured so callers can use the
 *    deterministic retrieval-only fallback (the system works without an LLM).
 */
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 12000;
let client = null;

function available() {
  return !!process.env.GROQ_API_KEY && process.env.LLM_DISABLED !== 'true';
}

function getClient() {
  if (!client) {
    const Groq = require('groq-sdk');
    client = new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: TIMEOUT_MS, maxRetries: 0 });
  }
  return client;
}

/** Test hook: inject a fake client implementing chat.completions.create. */
function _setClient(fake) { client = fake; }

/**
 * @returns {Promise<{content:string, usage:object, model:string, latencyMs:number}|null>}
 */
async function complete(messages, { json = false, maxTokens = 300, temperature = 0.3 } = {}) {
  if (!available() && !client?._fake) return null;
  const started = Date.now();
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await getClient().chat.completions.create({
        model: MODEL,
        messages,
        max_tokens: maxTokens,
        temperature,
        ...(json ? { response_format: { type: 'json_object' } } : {})
      });
      return {
        content: res.choices?.[0]?.message?.content || '',
        usage: res.usage || null,
        model: res.model || MODEL,
        latencyMs: Date.now() - started
      };
    } catch (err) {
      lastErr = err;
      const status = err.status || err.statusCode;
      const retryable = !status || status === 429 || status >= 500;
      if (!retryable || attempt === 1) break;
      await new Promise(r => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  console.error(`[llm] request failed: ${lastErr?.status || ''} ${lastErr?.name || 'Error'}`);
  return null;
}

module.exports = { complete, available, MODEL, _setClient };
