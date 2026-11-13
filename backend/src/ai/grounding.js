'use strict';
const { rawTokens, stem } = require('./text');

/**
 * Post-hoc groundedness check for assistant replies.
 *
 * The assistant may only state PERSONAL facts that appear in retrieved
 * evidence. This verifier extracts "checkable" spans from a reply – proper
 * nouns, numbers/years, months and weekdays – and flags those that do not
 * occur in the evidence, the patient's name, or the small set of words the
 * assistant is allowed to use about itself.
 *
 * It is a conservative, transparent heuristic, NOT a semantic entailment
 * model: it catches invented names, dates and places (the most harmful
 * confabulations for a person with memory loss) but cannot catch e.g. a
 * wrong relationship between two names that both appear in the evidence.
 * This limitation is documented in AI_METHODOLOGY.md.
 */

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// Capitalised words that are common in warm replies and are not personal facts.
const ALLOWED_CAPITALISED = new Set(['i', 'cara', 'vamora', 'you', 'your', 'it', 'that', 'this', 'what', 'would', 'how',
  'let', 'lets', 'do', 'shall', 'maybe', 'perhaps', 'yes', 'no', 'oh', 'hello', 'hi', 'good', 'morning', 'afternoon',
  'evening', 'night', 'thank', 'thanks', 'please', 'we', 'there', 'here', 'they', 'she', 'he', 'his', 'her', 'their',
  'is', 'are', 'was', 'were', 'can', 'could', 'should', 'will', 'did', 'does', 'when', 'where', 'who', 'why', 'which',
  'remember', 'tell', 'look', 'looking', 'these', 'those', 'one', 'some', 'ok', 'okay', 'sure', 'of', 'in', 'on', 'at',
  'a', 'an', 'the', 'and', 'but', 'or', 'so', 'if', 'all', 'my', 'me', 'our', 'today', 'tomorrow', 'yesterday', 'now',
  'family', 'memory', 'memories', 'photo', 'photos', 'picture', 'caregiver', 'doctor', 'not', 'sorry', 'great', 'lovely',
  'wonderful', 'beautiful', 'id', 'im', 'its', 'youre', 'ai', 'computer', 'assistant', 'helper', 'eid', 'allah', 'insha', 'allah']);

function evidenceVocabulary(evidenceTexts, extra = []) {
  const vocab = new Set();
  for (const t of [...evidenceTexts, ...extra]) {
    for (const tok of rawTokens(t)) { vocab.add(tok); vocab.add(stem(tok)); }
    // Years/numbers inside dates such as 2019-06-15
    for (const n of String(t).match(/\d+/g) || []) vocab.add(String(Number(n)));
    const d = Date.parse(t);
    if (!Number.isNaN(d) && /\d{4}-\d{2}-\d{2}/.test(t)) {
      const date = new Date(d);
      vocab.add(MONTHS[date.getUTCMonth()]); vocab.add(WEEKDAYS[(date.getUTCDay() + 6) % 7]);
      vocab.add(String(date.getUTCFullYear())); vocab.add(String(date.getUTCDate()));
    }
  }
  return vocab;
}

/** Spans in the reply that assert checkable personal facts. */
function checkableSpans(reply) {
  const spans = [];
  const sentences = String(reply).split(/(?<=[.!?])\s+/);
  for (const s of sentences) {
    const words = s.match(/[\p{L}\p{N}'’]+/gu) || [];
    words.forEach((w, i) => {
      const clean = w.replace(/['’]s$/i, '').replace(/['’]/g, '');
      const lower = clean.toLowerCase();
      if (/^\d+$/.test(clean)) { if (Number(clean) > 1 || clean.length >= 4) spans.push({ text: clean, kind: 'number' }); return; }
      if (MONTHS.includes(lower)) { spans.push({ text: lower, kind: 'month' }); return; }
      if (WEEKDAYS.includes(lower)) { spans.push({ text: lower, kind: 'weekday' }); return; }
      // Proper noun: capitalised, not sentence-initial (sentence-initial words are
      // capitalised anyway) – unless it is clearly a name-like token.
      if (/^\p{Lu}[\p{Ll}]+$/u.test(clean) && i > 0 && !ALLOWED_CAPITALISED.has(lower)) spans.push({ text: lower, kind: 'name' });
    });
  }
  return spans;
}

/**
 * @param {string} reply
 * @param {string[]} evidenceTexts  texts of retrieved memories
 * @param {object}  ctx  {patientName, extraAllowed: string[]}
 * @returns {{grounded:boolean, unsupported:string[], checked:number}}
 */
function verifyReply(reply, evidenceTexts, ctx = {}) {
  const vocab = evidenceVocabulary(evidenceTexts, [ctx.patientName || '', ...(ctx.extraAllowed || [])]);
  const spans = checkableSpans(reply);
  const unsupported = [...new Set(spans.filter(s => !vocab.has(s.text) && !vocab.has(stem(s.text))).map(s => s.text))];
  return { grounded: unsupported.length === 0, unsupported, checked: spans.length };
}

const MEDICAL_ADVICE_RE = /\b(\d+\s?(mg|ml|mcg)|take (two|2|one|1|an?)\s+(pill|tablet)|increase your dose|stop taking|double (the|your) dose)\b/i;

function containsMedicalAdvice(reply) {
  return MEDICAL_ADVICE_RE.test(String(reply));
}

module.exports = { verifyReply, checkableSpans, evidenceVocabulary, containsMedicalAdvice };
