'use strict';
/**
 * Offline retrieval evaluation for VAMORA personal-memory retrieval.
 *
 *   node eval/runRetrievalEval.js [--data eval/data/persona_fatima.json] [--model Xenova/all-MiniLM-L6-v2]
 *
 * Compares (all over the same synthetic collection, k = 5):
 *   recency        – the ORIGINAL system: most recent items, no relevance model
 *   bm25           – BM25 only (no expansion, no context)            [ablation]
 *   lexical        – BM25 + kinship expansion + context signals
 *   dense          – embeddings + context signals
 *   hybrid         – lexical + dense + context (production default)
 *   hybrid-noctx   – lexical + dense, no context signals             [ablation]
 *
 * Metrics (answerable queries): Hit@1 (top result has grade 2), MRR@5 (first
 * grade-2 result), Recall@5 (grade ≥ 1), nDCG@5 (gain 2^g − 1). Unanswerable
 * out-of-collection queries: abstention rate (no result returned). Paired
 * bootstrap 95% CIs (10,000 resamples, fixed seed) for hybrid − other on MRR.
 * Writes eval/results/retrieval-<model>.json and prints a Markdown table.
 */
const fs = require('fs');
const path = require('path');

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []));
if (args.model) process.env.EMBEDDING_MODEL = args.model;
process.env.EMBEDDINGS = 'on';
const { rankDocuments, documentText } = require('../src/ai/retriever');
const embeddings = require('../src/ai/embeddings');

const dataPath = path.resolve(args.data || path.join(__dirname, 'data', 'persona_fatima.json'));
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const K = 5;

// Synthetic creation dates for items without one (document order), for the recency baseline.
const docs = data.documents.map((d, i) => ({
  people: [], place: null, text: '', ...d,
  date: d.date || d.eventDate || new Date(Date.UTC(2024, 0, 1 + i)).toISOString()
}));

function atTime(hhmm) {
  const d = new Date(2026, 0, 15, 12, 0, 0);
  if (hhmm) { const [h, m] = hhmm.split(':').map(Number); d.setHours(h, m, 0, 0); }
  return d;
}

function metrics(ranked, rel) {
  const ids = ranked.map(r => r.id);
  const grade = (id) => rel[id] || 0;
  const firstPrimary = ids.findIndex(id => grade(id) === 2);
  const relevantAll = Object.keys(rel).filter(id => rel[id] >= 1);
  const dcg = ids.reduce((s, id, i) => s + (2 ** grade(id) - 1) / Math.log2(i + 2), 0);
  const ideal = Object.values(rel).sort((a, b) => b - a).slice(0, K).reduce((s, g, i) => s + (2 ** g - 1) / Math.log2(i + 2), 0);
  return {
    hit1: ids.length && grade(ids[0]) === 2 ? 1 : 0,
    mrr: firstPrimary >= 0 ? 1 / (firstPrimary + 1) : 0,
    recall: relevantAll.length ? relevantAll.filter(id => ids.includes(id)).length / relevantAll.length : 0,
    ndcg: ideal ? dcg / ideal : 0,
    empty: ids.length === 0 ? 1 : 0
  };
}

const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

function mulberry32(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

function pairedBootstrap(a, b, n = 10000, seed = 42) {
  const rnd = mulberry32(seed); const diffs = [];
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < a.length; j++) { const k = Math.floor(rnd() * a.length); s += a[k] - b[k]; }
    diffs.push(s / a.length);
  }
  diffs.sort((x, y) => x - y);
  return { mean: mean(a) - mean(b), lo: diffs[Math.floor(0.025 * n)], hi: diffs[Math.floor(0.975 * n)] };
}

(async () => {
  const t0 = Date.now();
  const docVecs = await embeddings.embed(docs.map(documentText));
  const queryVecs = await embeddings.embed(data.queries.map(q => q.text));
  const embedAvailable = !!docVecs && !!queryVecs;
  const modelLoadMs = Date.now() - t0;
  const docVectors = new Map(embedAvailable ? docs.map((d, i) => [d.id, docVecs[i]]) : []);

  const MODES = {
    recency: { mode: 'recency' },
    bm25: { mode: 'lexical', useContext: false, expansionWeight: 0 },
    lexical: { mode: 'lexical' },
    ...(embedAvailable ? {
      dense: { mode: 'dense' },
      'hybrid-noctx': { mode: 'hybrid', useContext: false },
      hybrid: { mode: 'hybrid' }
    } : {})
  };

  const perQuery = {};
  const summary = {};
  for (const [name, cfg] of Object.entries(MODES)) {
    perQuery[name] = [];
    const latencies = [];
    data.queries.forEach((q, qi) => {
      const started = process.hrtime.bigint();
      const out = rankDocuments(docs, q.text, { k: K, now: atTime(q.now), queryVector: embedAvailable ? queryVecs[qi] : null, docVectors, ...cfg });
      latencies.push(Number(process.hrtime.bigint() - started) / 1e6);
      perQuery[name].push({ id: q.id, kind: q.kind, ranked: out.items.map(i => i.id), ...metrics(out.items, q.rel) });
    });
    const ans = perQuery[name].filter((r, i) => Object.keys(data.queries[i].rel).length > 0);
    const oov = perQuery[name].filter(r => r.kind === 'unanswerable_oov');
    const byKind = {};
    for (const kind of [...new Set(ans.map(r => r.kind))]) {
      const rs = ans.filter(r => r.kind === kind);
      byKind[kind] = { n: rs.length, hit1: mean(rs.map(r => r.hit1)), mrr: mean(rs.map(r => r.mrr)), recall5: mean(rs.map(r => r.recall)) };
    }
    summary[name] = {
      nAnswerable: ans.length,
      hit1: mean(ans.map(r => r.hit1)), mrr5: mean(ans.map(r => r.mrr)), recall5: mean(ans.map(r => r.recall)), ndcg5: mean(ans.map(r => r.ndcg)),
      falseAbstention: mean(ans.map(r => r.empty)),
      oovAbstention: mean(oov.map(r => r.empty)), nOov: oov.length,
      rankingLatencyMsMean: mean(latencies),
      byKind
    };
  }

  const comparisons = {};
  if (summary.hybrid) {
    const ansIdx = data.queries.map((q, i) => (Object.keys(q.rel).length ? i : -1)).filter(i => i >= 0);
    const mrrOf = (m) => ansIdx.map(i => perQuery[m][i].mrr);
    for (const m of Object.keys(MODES).filter(m => m !== 'hybrid')) comparisons[`hybrid_minus_${m}_mrr`] = pairedBootstrap(mrrOf('hybrid'), mrrOf(m));
  }

  const result = {
    generatedAt: new Date().toISOString(), dataset: path.relative(path.join(__dirname, '..'), dataPath), datasetVersion: data.version,
    nDocuments: docs.length, nQueries: data.queries.length, k: K,
    embeddingModel: embedAvailable ? embeddings.MODEL : null, embeddingStatus: embeddings.status(), modelLoadAndEncodeMs: modelLoadMs,
    node: process.version, summary, comparisons, perQuery
  };
  const outDir = path.join(__dirname, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `retrieval-${(embeddings.MODEL || 'none').replace(/[^\w.-]+/g, '_')}.json`);
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));

  const f = (x) => x.toFixed(3);
  console.log(`\nDataset: ${result.dataset} (${docs.length} docs, ${data.queries.length} queries; ${summary.recency.nAnswerable} answerable, ${summary.recency.nOov} out-of-collection)`);
  console.log(`Embedding model: ${result.embeddingModel || 'unavailable'}\n`);
  console.log('| Mode | Hit@1 | MRR@5 | Recall@5 | nDCG@5 | False abstention | OOV abstention | Rank ms/query |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const [m, s] of Object.entries(summary)) console.log(`| ${m} | ${f(s.hit1)} | ${f(s.mrr5)} | ${f(s.recall5)} | ${f(s.ndcg5)} | ${f(s.falseAbstention)} | ${f(s.oovAbstention)} | ${s.rankingLatencyMsMean.toFixed(2)} |`);
  console.log('\nMRR@5 by query kind:');
  const kinds = Object.keys(summary.recency.byKind);
  console.log(`| Mode | ${kinds.join(' | ')} |`); console.log(`|---|${kinds.map(() => '---').join('|')}|`);
  for (const [m, s] of Object.entries(summary)) console.log(`| ${m} | ${kinds.map(k => `${f(s.byKind[k].mrr)} (n=${s.byKind[k].n})`).join(' | ')} |`);
  if (Object.keys(comparisons).length) {
    console.log('\nPaired bootstrap (95% CI) of MRR@5 differences:');
    for (const [k, c] of Object.entries(comparisons)) console.log(`  ${k}: ${f(c.mean)} [${f(c.lo)}, ${f(c.hi)}]`);
  }
  console.log(`\nWrote ${path.relative(process.cwd(), outFile)}`);
})().catch(e => { console.error(e); process.exit(1); });
