'use strict';
const { tokenize, expansions } = require('./text');

/**
 * Okapi BM25 (Robertson & Zaragoza, 2009) over a small per-patient corpus,
 * with optional relationship-lexicon query expansion at reduced weight.
 * Documents are {id, fields: [{text, weight}]}; field weight repeats tokens.
 */
class BM25 {
  constructor(docs, { k1 = 1.2, b = 0.75, expansionWeight = 0.4 } = {}) {
    this.k1 = k1; this.b = b; this.expansionWeight = expansionWeight;
    this.docs = docs.map(d => {
      const tf = new Map();
      let len = 0;
      for (const f of d.fields) {
        const w = f.weight || 1;
        for (const t of tokenize(f.text)) { tf.set(t, (tf.get(t) || 0) + w); len += w; }
      }
      return { id: d.id, tf, len };
    });
    this.N = this.docs.length;
    this.avgdl = this.docs.reduce((s, d) => s + d.len, 0) / Math.max(1, this.N);
    this.df = new Map();
    for (const d of this.docs) for (const t of d.tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
  }

  idf(t) {
    const n = this.df.get(t) || 0;
    return Math.log(1 + (this.N - n + 0.5) / (n + 0.5));
  }

  /** @returns Map<docId, {score, matched:string[]}> for docs with score > 0 */
  score(query) {
    const qTerms = new Map();
    for (const t of tokenize(query)) qTerms.set(t, 1);
    if (this.expansionWeight > 0) {
      for (const t of [...qTerms.keys()]) {
        for (const e of expansions(t)) if (!qTerms.has(e)) qTerms.set(e, this.expansionWeight);
      }
    }
    const out = new Map();
    for (const d of this.docs) {
      let s = 0; const matched = [];
      for (const [t, qw] of qTerms) {
        const f = d.tf.get(t);
        if (!f) continue;
        const denom = f + this.k1 * (1 - this.b + this.b * d.len / (this.avgdl || 1));
        s += qw * this.idf(t) * (f * (this.k1 + 1)) / denom;
        matched.push(t);
      }
      if (s > 0) out.set(d.id, { score: s, matched });
    }
    return out;
  }
}

module.exports = { BM25 };
