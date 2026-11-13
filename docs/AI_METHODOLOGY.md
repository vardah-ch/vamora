# AI Methodology

This document describes the AI components in VAMORA, why they are designed this way, and what has and has not been measured. Every number below was produced by scripts in `backend/eval/`, and the result files are committed in `backend/eval/results/`. All evaluation data is synthetic.

## 1. Design goals

| Goal | Rationale |
|---|---|
| **Never invent personal facts** | For a person with memory loss, a confident false statement ("your son visited yesterday") can cause distress or confusion, and the person may be unable to detect the error. |
| **Prefer "I'm not sure" to a guess** | Abstention is safer than coverage in this setting. |
| **Show where an answer comes from** | Recognition is easier than recall. A photo or memory card lets the person, and helpers, check the answer (Amershi et al., 2019, G11 "make clear why"). |
| **Data minimisation** | Only the few memories relevant to the current question leave the server, not the whole library. |
| **Work without the LLM** | The system must keep working with no API key, during an outage, and on a zero budget. |
| **Honesty about being a machine** | The original prompt told the model *"Never say you are an AI"*. That instruction was removed: Cara says it is a computer helper. |

## 2. Pipeline (`backend/src/ai/`)

```
message ─► safety.js ─┬─(urgent/medical/identity)─► fixed reply (+ alert permitted caregivers)
                      │
                      └─► retriever.js (hybrid, top-4) ─┬─ none supported ─► "I'm not sure…" (abstain)
                                                        │
                                                        ├─ no LLM key ───► evidence reply (deterministic)
                                                        │
                                                        └─► llm.js (Groq, JSON: reply + cited ids)
                                                              └─► grounding.js verify
                                                                    ├─ ok ─► reply + source cards
                                                                    └─ fail ─► 1 repair ─► else evidence reply
```

### 2.1 Personal knowledge representation
Memories are typed records, not free text (`memory_items`):

- `person`, `place`, `event` (with `eventDate`), `routine` (with `routineTime`), `written`;
- plus photo captions and their optional voice notes.

Every item records **who added it** and whether the **patient confirmed** it. Unconfirmed items are labelled for the model ("not yet confirmed") and for the user ("Added by a helper").

### 2.2 Retrieval (`retriever.js`)
Three signals are fused with **Reciprocal Rank Fusion** (k = 60):

1. **Lexical** – BM25 (k1 = 1.2, b = 0.75). Fields are weighted: title and people ×2, place ×1.5, text ×1. Queries are expanded through a small, hand-written kinship/concept lexicon covering English and romanised Urdu, weighted 0.4. **Since v2** expansion is hierarchical: specific terms expand to their general term and vice versa, never sideways (*son ↛ daughter*).
2. **Dense** – mean-pooled, L2-normalised embeddings from `Xenova/all-MiniLM-L6-v2` (384-d, int8 ONNX, CPU, ~23 MB). They are computed locally with transformers.js, so **no patient text is sent to a third party for embedding**. Vectors are cached in `memory_index`, keyed by content hash and model. Candidates need cosine ≥ **0.35**; this value was selected on the development set by a pre-declared rule (§4.3).
3. **Context** – structured signals from the knowledge representation:
   - a person named in the query (bonus 0.02);
   - who/where/when intent matching the memory type (0.008);
   - for "now/today/routine" questions, routines within 90 minutes (full) or 180 minutes (half) of the current time (0.016).

**Abstention rule.** A document is returned only if a lexical match, a dense match above threshold, a named person or a time-matched routine supports it. Intent alone never qualifies a document.

### 2.3 Generation (`companion.js`, prompt `cara-grounded-v1`)
- The system prompt lists *only* the retrieved memories as `[M1]…[Mk]`.
- The model must use only these for personal facts, admit uncertainty, use at most 3 short sentences, give no medical advice and use no emojis.
- It must reply in JSON: `{reply, used:[M…], confidence}`.
- History: the last 6 turns are passed as proper chat turns, each capped at 600 characters.
- Model `llama-3.3-70b-versatile` via Groq (configurable with `GROQ_MODEL`), temperature 0.3, 300 max tokens.
- Calls have a 12 s timeout and retry once on 429, 5xx or network errors. Prompts and replies are never logged.

### 2.4 Verification (`grounding.js`)
A transparent, deterministic check, **not** an entailment model:

- Extract *checkable spans* from the reply: proper nouns (capitalised words that are not sentence-initial), numbers and years, months and weekdays.
- Each span must appear in the retrieved evidence, the patient's first name, or a short allow-list.
- Cited `M` ids must refer to retrieved items.
- Replies that contain dosing instructions are rejected.
- On failure, the model gets **one repair attempt** that names the unsupported spans. If that also fails, the reply is replaced by a deterministic **evidence-only reply**.

**Known blind spots.** The verifier does not catch:

- wrong relations between entities that are both present ("Amna is your *sister*" when the evidence says daughter);
- lower-case invented content ("you went fishing");
- paraphrased dates ("last spring").

Semantic entropy (Farquhar et al., 2024) or claim-level NLI (Min et al., 2023) are candidate upgrades (see RESEARCH_PROPOSAL.md).

### 2.5 Safety layer (`safety.js`)
Regular-expression rules run before any model, in English and common romanised Urdu:

- **urgent** (falls, pain, being lost, self-harm): fixed reply naming the 1122 emergency number, plus an alert to caregivers who hold `alerts.receive`;
- **medical** (dosing and medication questions): redirect to the doctor or caregiver;
- **identity** ("are you a real person?"): an honest answer.

"Help me remember…" is explicitly *not* treated as urgent, and a test covers this. Coverage is limited and has not been validated against real messages.

### 2.6 Observation summarisation (`observationSummary.js`)
The output always includes a deterministic digest: counts by category, the distribution of self-reported moods, and a list of notes. An optional LLM narrative must cite note ids (`[N2]`) and is discarded if:

- it cites an unknown note, or
- it uses diagnostic or clinical-judgement language (diagnose, decline, depression, stage, prescribe…).

The output is labelled *"Draft… Not a clinical assessment."*

### 2.7 Mood camera
face-api.js (TinyFaceDetector + FaceExpressionNet) runs **in the browser**. The redesign follows Barrett et al. (2019), Dupré et al. (2020) and Kim et al. (2021):

- The camera is off until the person opts in.
- The output is presented as a *guess about the face*.
- The person always chooses their mood from all options, with the guess preselected.
- Nothing is saved, not even in local storage, unless the person confirms.
- The estimate is stored separately (`inference`), with `agreedWithEstimate`.
- Only self-reported or confirmed moods feed alerts and summaries. The API rejects unconfirmed camera saves.

The `agreedWithEstimate` field makes it possible, with consent and ethics approval, to measure how often people disagree with the camera. That would be an empirical contribution in its own right.

## 3. Cost and latency

| Component | Cost | Measured latency (this machine) |
|---|---|---|
| Local embeddings | free; ~23 MB one-time download | model load + encoding 43 docs + 50 queries: see `modelLoadAndEncodeMs` in the results file |
| Ranking (BM25 + cosine + fusion), 43 docs | free | **≈ 0.8–1.5 ms per query** (dev and held-out runs) |
| Retrieval-only reply (no LLM) | free | p50 ≈ 1 ms, p95 ≈ 3 ms (excluding HTTP and DB) |
| LLM reply (Groq) | per-token API pricing | **not measured**: no API key was available during this work |

## 4. Retrieval evaluation (measured)

### 4.1 Data
Two synthetic collections, described in `backend/eval/README.md`:

- **Development set "Fatima"**: 43 documents, 50 queries (42 answerable, 6 out-of-collection, 2 in-focus unanswerable).
- **Held-out set "Yusuf"**: 26 documents, 30 queries (25 answerable, 4 out-of-collection, 1 in-focus). Frozen and hashed **before** any dev-motivated change, and evaluated once.

Query kinds: direct, relational, paraphrase, routine (time-dependent), romanised Urdu, unanswerable.

### 4.2 Metrics
- **Hit@1**: the top result has grade 2.
- **MRR@5**: reciprocal rank of the first grade-2 result.
- **Recall@5** over grade ≥ 1.
- **nDCG@5**, with gain 2^g − 1.
- **False abstention**: answerable queries that get no result.
- **OOV abstention**: out-of-collection queries that correctly get no result.
- Paired bootstrap 95% CIs (10,000 resamples, seed 42).

### 4.3 Procedure (git history records the order)
1. v1 was evaluated on dev.
2. Error analysis found the son/daughter expansion defect.
3. The held-out set was written and frozen.
4. v2 fixed the lexicon structure. No new vocabulary was added, so the held-out set was not contaminated.
5. The dense threshold was swept on dev only, with a pre-declared selection rule. The rule selected 0.35.
6. The held-out set was evaluated once.

### 4.4 Results – development set (v2)

| Mode | Hit@1 | MRR@5 | Recall@5 | nDCG@5 | False abst. | OOV abst. |
|---|---|---|---|---|---|---|
| recency (**original VAMORA**) | 0.048 | 0.084 | 0.149 | 0.089 | 0.000 | 0.000 |
| BM25 only | 0.571 | 0.615 | 0.595 | 0.610 | 0.214 | 0.833 |
| lexical (+ expansion + context) | 0.690 | 0.744 | 0.815 | 0.768 | 0.048 | 0.667 |
| dense (+ context) | 0.619 | 0.706 | 0.754 | 0.714 | 0.119 | 0.667 |
| hybrid, no context | 0.762 | 0.812 | 0.839 | 0.817 | 0.071 | 0.500 |
| **hybrid (deployed)** | **0.810** | **0.870** | **0.923** | **0.881** | **0.000** | 0.500 |

MRR@5 differences, hybrid minus the other mode [95% CI]:

| vs | Difference [95% CI] |
|---|---|
| recency | +0.786 [0.678, 0.883] |
| BM25 | +0.255 [0.110, 0.397] |
| lexical | +0.126 [0.031, 0.232] |
| dense | +0.163 [0.057, 0.282] |
| hybrid, no context | +0.058 [−0.034, 0.158] |

### 4.5 Results – held-out set (single evaluation)

| Mode | Hit@1 | MRR@5 | Recall@5 | nDCG@5 | False abst. | OOV abst. |
|---|---|---|---|---|---|---|
| recency (**original VAMORA**) | 0.000 | 0.018 | 0.117 | 0.053 | 0.000 | 0.000 |
| BM25 only | 0.720 | 0.760 | 0.753 | 0.765 | 0.200 | 0.250 |
| lexical | 0.720 | 0.820 | 0.853 | 0.844 | 0.080 | 0.250 |
| dense | 0.560 | 0.667 | 0.773 | 0.705 | 0.080 | 0.500 |
| hybrid, no context | 0.720 | 0.800 | 0.813 | 0.818 | 0.040 | 0.000 |
| **hybrid (deployed)** | 0.720 | **0.833** | **0.893** | **0.866** | **0.000** | **0.000** |

MRR@5 differences, hybrid minus the other mode [95% CI]:

| vs | Difference [95% CI] |
|---|---|
| recency | +0.815 [0.700, 0.916] |
| BM25 | +0.073 [−0.080, 0.240] |
| lexical | +0.013 [−0.080, 0.120] |
| dense | +0.167 [0.060, 0.293] |
| hybrid, no context | +0.033 [−0.040, 0.133] |

### 4.6 Interpretation

**Supported by the data (synthetic collections only):**

1. Relevance-based retrieval vastly outperforms the original design, which sent the 20 most recent items regardless of the question. The difference is large on both sets and its CI excludes zero.
2. Hybrid beats dense-only on both sets.
3. Hybrid produced **no false abstentions** on either set.

**Not supported:**

1. Hybrid is **not** significantly better than lexical + context on the held-out set (+0.013, CI includes 0). On dev it was, but dev informed the design.
2. The benefit of the **context signals** is not significant on either set. They help routine queries (dev routine MRR 0.886 vs 0.429 without context) but slightly hurt some direct queries.

**Clear weakness – retrieval-level abstention is unreliable.** The deployed hybrid abstained on 3/6 dev and **0/4 held-out** out-of-collection queries. Examples:

- "trip to London" retrieved *Trip to Murree*;
- "Did I ever work in a factory?" retrieved *My old job*.

Retrieval cannot decide whether a question is answerable. That job falls to the generation instructions and the verifier, whose effectiveness with a real LLM has **not yet been measured** (§5).

**Romanised Urdu (exploratory).** A multilingual model (`paraphrase-multilingual-MiniLM-L12-v2`) did **not** help: dense-only Urdu MRR was 0.07 (dev) and 0.17 (held-out). These models are trained on Urdu script, not romanised Urdu. Held-out Urdu MRR for hybrid was 0.50 (n = 3). This is a genuine open problem for the deployment context (§G2 in LITERATURE_REVIEW.md). Note that the 0.35 threshold was not calibrated for that model.

## 5. End-to-end companion evaluation (harness ready; LLM arms not run)

`eval/runCompanionEval.js` compares two arms:

- **baseline_original**: a faithful re-implementation of the original prompt, with context stuffing, temperature 0.7, no verification and "never say you are an AI";
- **grounded**: the current pipeline.

Automatic proxies:

- **unsupported rate**: the verifier run against the *whole* persona collection, a lower bound on confabulation;
- **correct abstention** on unanswerable queries;
- **answered rate** on answerable queries;
- fallback rate;
- latency p50/p95.

**Status:** without `GROQ_API_KEY` only the deterministic arm can run.

| Arm (no LLM) | Unsupported | Correct abstention (unanswerable) | Answered (proxy) |
|---|---|---|---|
| retrieval_only, dev | 0.000 | 0.375 | 0.881 |
| retrieval_only, held-out | 0.000 | 0.000 | 0.840 |

These figures restate §4.6: without a generator that can judge answerability, the system shows a related memory rather than saying "I don't know" when the question is about something absent. **No claim is made about LLM hallucination rates.** To run the comparison:

```bash
cd backend && GROQ_API_KEY=... node eval/runCompanionEval.js --data eval/data/persona_yusuf_heldout.json
```

The automatic proxies must be complemented by human rating (protocol in TESTING_AND_EVALUATION.md §4).

## 6. Reproducibility
- The prompt version (`cara-grounded-v1`), embedding model id, threshold, dataset hashes and Node version are recorded in each results JSON.
- Ranking is deterministic. Bootstrap uses a fixed seed. Embeddings use a fixed quantised model.
- The automated tests (`npm test`) run with `EMBEDDINGS=off` and no LLM, so they are fully deterministic and offline.
