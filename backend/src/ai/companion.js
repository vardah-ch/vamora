'use strict';
const retriever = require('./retriever');
const grounding = require('./grounding');
const safety = require('./safety');
const llm = require('./llm');

/**
 * Cara: retrieval-grounded memory companion.
 *
 * Pipeline (each stage recorded in the reply's `grounding` metadata):
 *   1. Safety rules (deterministic, pre-LLM).
 *   2. Retrieve top-k personal memories for the message (hybrid retrieval).
 *   3. If none are relevant → honest "I don't know" reply (abstention), no LLM.
 *   4. Otherwise ask the LLM for a short reply, in JSON, citing memory ids,
 *      using ONLY the retrieved evidence (data minimisation: only these few
 *      memories leave the server, not the whole library).
 *   5. Verify: citations must be retrieved ids; checkable facts (names, dates,
 *      numbers) must appear in the evidence; no dosing advice. One repair
 *      attempt; otherwise fall back to a deterministic, evidence-only reply.
 *   6. Without an API key the deterministic reply is used directly.
 */
const PROMPT_VERSION = 'cara-grounded-v1';
const TOP_K = 4;

function systemPrompt(patientName, evidence) {
  const lines = evidence.map((e, i) => `[M${i + 1}] (${e.type}${e.confirmed === false ? ', added by a caregiver and not yet confirmed by ' + patientName : ''}) ${retriever.documentText(e)}${e.eventDate ? ` (date: ${e.eventDate})` : ''}${e.routineTime ? ` (usual time: ${e.routineTime})` : ''}`);
  return [
    `You are Cara, a gentle computer helper inside the VAMORA app, talking with ${patientName}, who has memory difficulties.`,
    'You are not a person, and if asked you say so kindly.',
    '',
    'MEMORIES you may use (the ONLY source of personal facts):',
    ...lines,
    '',
    'Rules:',
    '1. Only mention people, places, dates or events that appear in the MEMORIES above. Never invent or guess personal details.',
    '2. If the memories do not answer the question, say you are not sure and suggest asking someone they trust.',
    `3. If a memory is marked "not yet confirmed", say gently that someone else added it; do not present it as certain.`,
    '4. Use short, simple sentences (at most 3) and plain words. One gentle question at the end is welcome.',
    '5. Never give medical advice, diagnoses, or medication instructions.',
    '6. Do not use emojis.',
    'Respond ONLY with JSON: {"reply": string, "used": ["M1", ...], "confidence": "high"|"medium"|"low"}'
  ].join('\n');
}

/** Deterministic, evidence-only reply. Used without an LLM or when verification fails. */
function evidenceReply(patientName, evidence) {
  if (!evidence.length) {
    return `I'm not sure, ${patientName}. I couldn't find that in your saved memories. You could ask someone you trust, or add it as a new memory together.`;
  }
  const top = evidence[0];
  const detail = top.text ? ` ${top.text.split(/(?<=[.!?])\s+/)[0]}` : '';
  const who = top.confirmed === false ? ' (a caregiver added this memory)' : '';
  const prefix = top.sourceType === 'photo' ? 'Here is a photo that might help' : 'Here is something from your memories';
  return `${prefix}, ${patientName}: "${top.title}".${detail}${who} Would you like to look at it together?`;
}

function parseJson(content) {
  try {
    const m = String(content).match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch { return null; }
}

/**
 * @param {object} p
 * @param {number} p.patientUserId
 * @param {string} p.patientName  first name only (data minimisation)
 * @param {string} p.message
 * @param {Array}  p.history      [{role, content}] recent turns
 * @param {function} [p.onUrgent] called when the safety layer detects an urgent message
 * @param {function} [p.retrieve] injectable for evaluation
 */
async function respond({ patientUserId, patientName, message, history = [], onUrgent, retrieve, now = new Date() }) {
  const started = Date.now();
  const meta = { promptVersion: PROMPT_VERSION, llmModel: null, retrievalMode: null, status: null, unsupported: [], attempts: 0 };

  const rule = safety.classify(message);
  if (rule) {
    if (rule.notifyCaregivers && onUrgent) await onUrgent();
    meta.status = `safety:${rule.category}`;
    return { reply: rule.reply(patientName), sources: [], grounding: { ...meta, latencyMs: Date.now() - started } };
  }

  const retrieval = await (retrieve || retriever.retrieve)(patientUserId, message, { k: TOP_K, now });
  const evidence = retrieval.items;
  meta.retrievalMode = retrieval.mode;

  if (!evidence.length) {
    meta.status = 'no_relevant_memory';
    return { reply: evidenceReply(patientName, []), sources: [], grounding: { ...meta, latencyMs: Date.now() - started } };
  }

  const sources = (ids) => evidence.filter(e => ids.includes(e.id)).map(e => ({ id: e.id, sourceType: e.sourceType, type: e.type, title: e.title, confirmed: e.confirmed }));

  if (!llm.available()) {
    meta.status = 'retrieval_only';
    return { reply: evidenceReply(patientName, evidence), sources: sources([evidence[0].id]), grounding: { ...meta, latencyMs: Date.now() - started } };
  }

  const evidenceTexts = evidence.map(e => [retriever.documentText(e), e.eventDate || '', e.routineTime || ''].join(' '));
  const messages = [
    { role: 'system', content: systemPrompt(patientName, evidence) },
    ...history.slice(-6).map(h => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: String(h.content).slice(0, 600) })),
    { role: 'user', content: String(message).slice(0, 1000) }
  ];

  for (let attempt = 1; attempt <= 2; attempt++) {
    meta.attempts = attempt;
    const out = await llm.complete(messages, { json: true, maxTokens: 300, temperature: 0.3 });
    if (!out) { meta.status = 'llm_unavailable_fallback'; break; }
    meta.llmModel = out.model;
    const parsed = parseJson(out.content);
    const reply = String(parsed?.reply || '').trim();
    if (!reply) { meta.status = 'llm_bad_format_fallback'; continue; }

    const usedIds = (Array.isArray(parsed.used) ? parsed.used : [])
      .map(u => /^M(\d+)$/i.exec(String(u))).filter(Boolean).map(m => evidence[Number(m[1]) - 1]?.id).filter(Boolean);
    const check = grounding.verifyReply(reply, evidenceTexts, { patientName });
    const medical = grounding.containsMedicalAdvice(reply);
    if (check.grounded && !medical) {
      meta.status = 'grounded';
      meta.confidence = ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'medium';
      return { reply, sources: sources(usedIds.length ? usedIds : [evidence[0].id]), grounding: { ...meta, latencyMs: Date.now() - started } };
    }
    meta.unsupported = check.unsupported;
    meta.status = medical ? 'medical_advice_blocked' : 'unsupported_claims';
    messages.push({ role: 'assistant', content: out.content });
    messages.push({ role: 'user', content: `Your reply mentioned details that are not in the MEMORIES (${check.unsupported.join(', ') || 'medical advice'}). Rewrite it using only the MEMORIES, in the same JSON format.` });
  }

  meta.status = `fallback_after_${meta.status}`;
  return { reply: evidenceReply(patientName, evidence), sources: sources([evidence[0].id]), grounding: { ...meta, latencyMs: Date.now() - started } };
}

module.exports = { respond, systemPrompt, evidenceReply, PROMPT_VERSION, TOP_K };
