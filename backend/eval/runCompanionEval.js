'use strict';
/**
 * End-to-end companion evaluation (requires GROQ_API_KEY for the LLM arms).
 *
 *   GROQ_API_KEY=... node eval/runCompanionEval.js [--data eval/data/persona_yusuf_heldout.json] [--limit 30]
 *
 * Arms
 *   baseline_original – re-implementation of the ORIGINAL VAMORA prompt (commit
 *                       fce8614): the 20 most recent items pasted into the system
 *                       prompt, temperature 0.7, no retrieval, no verification.
 *   grounded          – current pipeline (hybrid retrieval → JSON reply with
 *                       citations → verifier → one repair → evidence fallback).
 *   retrieval_only    – no LLM (deterministic evidence reply). Always runnable.
 *
 * Measures per arm
 *   unsupportedRate   – share of replies in which the verifier finds names, places,
 *                       numbers or dates that are absent from the WHOLE persona
 *                       collection (a proxy for confabulation; it under-counts
 *                       wrong-but-present facts, see AI_METHODOLOGY.md)
 *   abstainCorrect    – share of unanswerable queries answered with uncertainty
 *                       ("not sure"/"don't know"/"couldn't find") instead of content
 *   answeredRate      – share of answerable queries whose reply mentions the title
 *                       of a grade-2 document (a lenient automatic proxy)
 *   latency p50/p95, attempts, fallback rate
 * Automatic proxies are NOT a substitute for human rating; a rating protocol
 * is in docs/TESTING_AND_EVALUATION.md.
 */
const fs = require('fs');
const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []));
process.env.EMBEDDINGS = process.env.EMBEDDINGS || 'on';
const { rankDocuments, documentText } = require('../src/ai/retriever');
const embeddings = require('../src/ai/embeddings');
const companion = require('../src/ai/companion');
const grounding = require('../src/ai/grounding');
const llm = require('../src/ai/llm');

const dataPath = path.resolve(args.data || path.join(__dirname, 'data', 'persona_yusuf_heldout.json'));
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const limit = Number(args.limit) || data.queries.length;
const docs = data.documents.map((d, i) => ({ people: [], text: '', ...d, confirmed: true, date: d.date || d.eventDate || new Date(Date.UTC(2024, 0, 1 + i)).toISOString() }));
const allEvidence = docs.map(d => [documentText(d), d.eventDate || '', d.routineTime || ''].join(' '));
const UNCERTAIN_RE = /not sure|don'?t know|couldn'?t find|can'?t find|no memory|do not have|i'm not certain/i;

function atTime(hhmm) {
  const d = new Date(2026, 0, 15, 12, 0, 0);
  if (hhmm) { const [h, m] = hhmm.split(':').map(Number); d.setHours(h, m, 0, 0); }
  return d;
}

async function baselineOriginal(q) {
  // Faithful to the original buildPatientContext (photos/memories as a flat list, warm persona).
  const recent = [...docs].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 20);
  let ctx = `You are Cara, a warm and caring AI companion for an Alzheimer's patient named ${data.persona.name}. `;
  ctx += 'You speak gently, warmly, and with lots of love and patience. Always use the patient\'s name. ';
  ctx += 'Never say you are an AI model or mention Groq or any technology. You are simply Cara, their companion.\n\n';
  ctx += `${data.persona.name}'s saved memories:\n` + recent.map((d, i) => `${i + 1}. "${documentText(d)}"`).join('\n') + '\n\n';
  ctx += 'Important rules:\n1. Always be warm, gentle, and patient\n2. Keep responses short and simple — maximum 3 sentences\n3. Always end with a gentle question or encouragement\n4. If patient seems sad or anxious, console them with love\n5. Reference their actual memories and moods when relevant\n6. Never give medical advice — always suggest speaking to their caregiver or doctor\n7. Use emojis occasionally to keep the tone warm 💜\n';
  const t = Date.now();
  const out = await llm.complete([{ role: 'system', content: ctx }, { role: 'user', content: q.text }], { maxTokens: 150, temperature: 0.7 });
  return { reply: out?.content || '', latencyMs: Date.now() - t, status: out ? 'ok' : 'llm_error', attempts: 1 };
}

async function grounded(q, qv, docVectors) {
  const retrieve = async (_pid, text, opts) => rankDocuments(docs, text, { ...opts, now: atTime(q.now), queryVector: qv, docVectors });
  const t = Date.now();
  const r = await companion.respond({ patientUserId: 0, patientName: data.persona.name, message: q.text, retrieve, now: atTime(q.now) });
  return { reply: r.reply, latencyMs: Date.now() - t, status: r.grounding.status, attempts: r.grounding.attempts || 0 };
}

const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };

(async () => {
  const queries = data.queries.slice(0, limit);
  const docVecs = await embeddings.embed(docs.map(documentText));
  const qVecs = await embeddings.embed(queries.map(q => q.text));
  const docVectors = new Map(docVecs ? docs.map((d, i) => [d.id, docVecs[i]]) : []);
  const titleOf = Object.fromEntries(docs.map(d => [d.id, d.title]));

  const haveLLM = llm.available();
  const arms = haveLLM ? ['baseline_original', 'grounded'] : ['retrieval_only'];
  const results = {};
  for (const arm of arms) {
    const rows = [];
    for (const [i, q] of queries.entries()) {
      const out = arm === 'baseline_original' ? await baselineOriginal(q) : await grounded(q, qVecs?.[i] || null, docVectors);
      const check = grounding.verifyReply(out.reply, allEvidence, { patientName: data.persona.name });
      const answerable = Object.keys(q.rel).length > 0;
      const primaryTitles = Object.entries(q.rel).filter(([, g]) => g === 2).map(([id]) => titleOf[id]);
      rows.push({
        id: q.id, kind: q.kind, answerable, reply: out.reply, status: out.status, attempts: out.attempts, latencyMs: out.latencyMs,
        unsupported: check.unsupported,
        uncertain: UNCERTAIN_RE.test(out.reply),
        mentionsPrimary: primaryTitles.some(t => t && out.reply.toLowerCase().includes(String(t).toLowerCase().split(/[ ,]/)[0]))
      });
    }
    const ans = rows.filter(r => r.answerable); const un = rows.filter(r => !r.answerable);
    results[arm] = {
      n: rows.length,
      unsupportedRate: rows.filter(r => r.unsupported.length).length / rows.length,
      abstainCorrect: un.length ? un.filter(r => r.uncertain).length / un.length : null,
      answeredRate: ans.length ? ans.filter(r => r.mentionsPrimary).length / ans.length : null,
      fallbackRate: rows.filter(r => /fallback/.test(r.status)).length / rows.length,
      latencyP50: pct(rows.map(r => r.latencyMs), 0.5), latencyP95: pct(rows.map(r => r.latencyMs), 0.95),
      rows
    };
  }
  const out = {
    generatedAt: new Date().toISOString(), dataset: path.basename(dataPath), llmModel: haveLLM ? llm.MODEL : null,
    promptVersion: companion.PROMPT_VERSION, embeddingModel: docVecs ? embeddings.MODEL : null,
    note: haveLLM ? 'LLM arms executed.' : 'GROQ_API_KEY not set: only the deterministic retrieval_only arm was run. LLM arms NOT evaluated.',
    results
  };
  const file = path.join(__dirname, 'results', `companion-${path.basename(dataPath, '.json')}-${haveLLM ? 'llm' : 'retrieval_only'}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(out.note);
  for (const [arm, r] of Object.entries(results)) {
    console.log(`${arm}: unsupported=${r.unsupportedRate.toFixed(3)} abstainCorrect=${r.abstainCorrect?.toFixed(3)} answered=${r.answeredRate?.toFixed(3)} fallback=${r.fallbackRate.toFixed(3)} p50=${r.latencyP50}ms p95=${r.latencyP95}ms`);
  }
  console.log(`Wrote ${path.relative(process.cwd(), file)}`);
})().catch(e => { console.error(e); process.exit(1); });
