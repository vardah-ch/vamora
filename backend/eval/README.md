# VAMORA offline evaluation

All data in this folder is **synthetic**. The personas are fictional and were written by the system developer. No real patient's information was used.

## Collections

| File | Role | Docs | Queries | SHA-256 (frozen) |
|---|---|---|---|---|
| `data/persona_fatima.json` | **Development set**: used for error analysis and design changes | 43 | 50 | `3f231b5f…a7e6cb748eb0be39a11770f50f7f25bfcf` |
| `data/persona_yusuf_heldout.json` | **Held-out test set**: never used for tuning, evaluated once per frozen system version | 26 | 30 | `28e8b26a…14c86287083c65f6205e6c31211fbcfda900f` |

Each collection mixes photo captions with typed memories (person, place, event, routine, written). Queries are labelled by kind:

- `direct`: names an item ("Who is Hina?").
- `relational`: uses a relationship rather than a name ("Who is my daughter?").
- `paraphrase`: wording deliberately different from the memory text.
- `routine`: time-dependent ("What should I do now?" at a given time).
- `urdu_romanised`: Roman Urdu.
- `unanswerable_oov`: refers to entities or facts that are not in the collection. The correct retrieval behaviour is to return nothing.
- `unanswerable_infocus`: the entity exists but the asked-for fact does not. Retrieval cannot detect this; only the generation layer can.

Relevance grades: **2** means the item answers the query; **1** means it is related and useful context.

## Protocol and its limitations

1. The **same person** wrote the system, the memories, the queries and the relevance judgements. Queries were written to avoid copying memory wording (the paraphrase kind tests this explicitly), but author bias toward the system's lexicon cannot be excluded. A credible study needs queries and judgements from independent annotators, ideally caregivers.
2. **Sequence (recorded in git history):**
   - v1 of the retriever was evaluated on the development set (`results/v1-dev-*.json`).
   - Error analysis then found that the kinship lexicon placed *son* and *daughter* in one expansion group.
   - **Before** any change, the held-out set was written and frozen (hashes above, commit timestamp).
   - Changes motivated by the dev-set analysis were then made, and the held-out set was evaluated once.
3. **Dense-similarity threshold selection rule** (declared before the sweep was run): sweep `DENSE_MIN_SIMILARITY` on the **development set only**. Choose the value that maximises out-of-collection abstention, subject to hybrid MRR@5 within 0.01 of the best MRR@5 in the sweep and false-abstention ≤ 0.05. The chosen value is then fixed for the held-out evaluation.
4. The collections are small (50 and 30 queries), so confidence intervals are wide. Paired bootstrap CIs (10,000 resamples, seed 42) are reported. Results describe these synthetic collections only and must **not** be read as evidence of benefit for people with dementia.

## Running

```bash
cd backend
npm run eval:retrieval                                         # dev set, default English model
node eval/runRetrievalEval.js --data eval/data/persona_yusuf_heldout.json
node eval/runRetrievalEval.js --model Xenova/paraphrase-multilingual-MiniLM-L12-v2
node eval/sweepDenseThreshold.js                               # dev set only
npm run eval:companion                                         # end-to-end; needs GROQ_API_KEY
```

The first run downloads the embedding model (~23 MB for the default) into `backend/.model-cache/`. Afterwards everything runs offline on a CPU.
