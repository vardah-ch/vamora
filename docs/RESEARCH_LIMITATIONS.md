# Research Limitations

These limitations constrain what can be claimed about VAMORA today.

## 1. Evidence
1. **No human-subject evaluation.**
   - No person with dementia, caregiver or clinician has used the system in a study.
   - Nothing is known about usability, comprehension of the consent controls, benefit or harm.
2. **No clinical validation.** VAMORA does not diagnose, treat, monitor disease progression or improve memory, and must not be described as doing so.
3. **Synthetic, single-author test collections.**
   - The retrieval results come from two fictional personas (69 documents, 80 queries).
   - The same person wrote the system, the data and the relevance judgements.
   - The held-out protocol reduces tuning bias but not *authoring* bias.
   - Results may not transfer to real memory libraries, which are messier: duplicated people, inconsistent captions, mixed languages.
4. **Small samples.**
   - Wide confidence intervals: held-out n = 25 answerable queries.
   - Several conclusions are "no significant difference", not "no difference".
   - Per-kind results (e.g. n = 3 Urdu queries) are anecdotal.
5. **Real-LLM behaviour not measured.** The hallucination-reduction pipeline was tested with a scripted fake model. Its effect with Llama 3.3 or any other model is unknown until `runCompanionEval.js` is run with an API key, and replies are rated by humans.
6. **The groundedness verifier is a heuristic.**
   - It checks proper nouns, numbers, months and weekdays only.
   - It misses wrong relations between present entities, lower-case fabrications and paraphrased dates.
   - Its precision and recall have not been measured against human judgement.

## 2. Technical
1. Retrieval-level abstention is weak (0/4 out-of-collection queries on the held-out set). Abstention relies on the generator and the verifier.
2. Romanised Urdu is poorly supported. The tested multilingual embedding model did not help. The hand-written lexicon is small and English-centred.
3. The safety rules (urgent, medical, identity) are regular expressions with unknown sensitivity and specificity on real messages.
4. Speech recognition uses the browser vendor's cloud service (not VAMORA's), so its privacy depends on the vendor. Accuracy for dementia-affected or Urdu speech is untested.
5. The mood camera uses a general facial-expression model with known accuracy problems for older faces. The redesign limits harm but does not make the estimate valid.
6. Embeddings are stored as JSONB with brute-force similarity. This is fine for hundreds of items per person, but not designed for large libraries.
7. Remaining security gaps:
   - tokens in `localStorage`;
   - no MFA;
   - no encryption at rest beyond infrastructure;
   - no malware scanning;
   - no email transport for password reset;
   - two moderate transitive `npm audit` advisories.
8. Frontend: no automated unit tests. Browser checks covered the main workflows only. No formal WCAG audit was performed. 14 ESLint findings remain (all pre-existing patterns).
9. The tool-supported browser test and the dev database used during this work were run locally; there is no CI pipeline.

## 3. Ethical and legal
1. Representative authority is *recorded*, not *verified*. A clinician's note is only as reliable as the clinician's check.
2. A coercive family member with representative authority, or physical access to the patient's device, can still misuse data. Software cannot detect in-person coercion.
3. People with dementia may not read or understand the access log. Its protective value depends on someone reviewing it.
4. Sending even minimal personal data to a third-party LLM provider may be inappropriate under some jurisdictions or institutional policies.
5. No legal review against Pakistani law, GDPR or HIPAA has been done.
6. Account erasure is not an admin one-click action, by design. A documented, verified erasure procedure does not yet exist.

## 4. Scope
- The four roles and workflows reflect the original student project's assumptions (e.g. one doctor creating patients). They were not designed with clinicians or families.
- The memory model does not yet support multiple patients sharing memories (e.g. a couple), memory versioning, or bulk import.
