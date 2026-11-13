'use strict';
/**
 * Sweep DENSE_MIN_SIMILARITY on the DEVELOPMENT set only and apply the selection
 * rule declared in eval/README.md before the sweep was run:
 *   maximise out-of-collection abstention, subject to hybrid MRR@5 within 0.01
 *   of the best MRR@5 in the sweep and false abstention ≤ 0.05.
 */
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const thresholds = [0.25, 0.28, 0.30, 0.32, 0.35, 0.38, 0.40, 0.42, 0.45, 0.50];
const rows = [];
for (const t of thresholds) {
  execFileSync(process.execPath, [path.join(__dirname, 'runRetrievalEval.js')], { env: { ...process.env, DENSE_MIN_SIMILARITY: String(t) }, stdio: 'pipe' });
  const r = JSON.parse(fs.readFileSync(path.join(__dirname, 'results', 'retrieval-Xenova_all-MiniLM-L6-v2.json'), 'utf8'));
  const h = r.summary.hybrid;
  rows.push({ threshold: t, mrr5: h.mrr5, hit1: h.hit1, recall5: h.recall5, falseAbstention: h.falseAbstention, oovAbstention: h.oovAbstention });
}
const best = Math.max(...rows.map(r => r.mrr5));
const eligible = rows.filter(r => r.mrr5 >= best - 0.01 && r.falseAbstention <= 0.05);
const chosen = eligible.sort((a, b) => b.oovAbstention - a.oovAbstention || b.mrr5 - a.mrr5 || a.threshold - b.threshold)[0];
console.log('| threshold | MRR@5 | Hit@1 | Recall@5 | False abst. | OOV abst. |\n|---|---|---|---|---|---|');
for (const r of rows) console.log(`| ${r.threshold} | ${r.mrr5.toFixed(3)} | ${r.hit1.toFixed(3)} | ${r.recall5.toFixed(3)} | ${r.falseAbstention.toFixed(3)} | ${r.oovAbstention.toFixed(3)} |`);
console.log(`\nSelected threshold (pre-declared rule): ${chosen ? chosen.threshold : 'none eligible'}`);
fs.writeFileSync(path.join(__dirname, 'results', 'dense-threshold-sweep-dev.json'), JSON.stringify({ rule: 'max OOV abstention s.t. MRR@5 >= best-0.01 and falseAbstention <= 0.05', rows, chosen }, null, 2));
