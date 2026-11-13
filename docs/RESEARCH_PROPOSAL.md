# Research Proposal: Grounded, Consent-Aware Personal Memory Assistance for People Living with Dementia

**Status.** This is a proposal built on an implemented prototype. The engineering artefacts and the offline retrieval results described here exist. **No study with people has been conducted.**

## 1. Motivation and problem statement

Alzheimer's disease erodes episodic memory early, while recognition of familiar faces and places, and older autobiographical memories, are often relatively preserved. Memory aids built on personal cues (lifelogs, reminiscence systems) show promise but modest and inconsistent benefits (Woods et al., 2018; Silva et al., 2016).

Large language models (LLMs) make *conversational* access to personal memories possible: "Who is the woman in this photo?" or "What do I do now?". But LLMs confabulate (Ji et al., 2023), and in health settings they give unsafe answers (Singhal et al., 2023). For someone who cannot verify an answer against their own memory, a fluent false answer about their own life is a distinctive harm.

These systems also collect intimate data, and that data is typically managed by family members. The ethics literature documents tensions between safety, autonomy and privacy (Niemeijer et al., 2010; Hall et al., 2019). Few systems put these principles into software in a way that can be tested.

**Problem.** How can an assistive system answer personal memory questions *only* from evidence the person (or someone they authorised) has provided, say "I don't know" when that evidence is absent, and let the person keep meaningful control over who sees and changes their memories?

## 2. Research directions, questions and hypotheses

### RD1 – Personalised memory retrieval

- **RQ1.1** For small, private, typed personal-memory collections, does hybrid retrieval (lexical + dense + structured context) retrieve relevant cues better than the context-stuffing approach common in LLM companions?
- **RQ1.2** Which components contribute (expansion, dense similarity, time and person context), and for which query types (relational, routine, code-switched)?
- **RQ1.3** Can retrieval-level signals predict answerability, or must abstention happen at generation?

**Status of evidence.** Measured on synthetic collections (AI_METHODOLOGY.md §4):

- RQ1.1 supported on both sets (held-out ΔMRR = 0.815, CI [0.70, 0.92]).
- RQ1.2: context helps routine queries, but its overall benefit is not significant, and hybrid ≈ lexical + context on the held-out set.
- RQ1.3: retrieval-level abstention is poor (0/4 on held-out).

**H1.** On an *independently authored* collection, hybrid retrieval will exceed lexical-only MRR@5 by ≥ 0.05. This is currently *not* supported on the held-out set, so it is an open question.

### RD2 – Privacy-preserving caregiver collaboration

- **RQ2.1** Can decision-specific, permission-scoped consent with representatives, "restriction always allowed" and patient-readable access logs be implemented so that it is (a) verifiably enforced and (b) understandable to people with mild dementia?
- **RQ2.2** Do patients and caregivers choose narrower sharing than the "all access" default of typical apps, and does that change caregiver workload or satisfaction?

**Status.** (a) is implemented and verified by 35 automated tests (authorisation + consent suites). (b) is untested.

**H2a.** At least 70% of participants with mild dementia can correctly answer "Who can see your photos?" after using My Privacy (comprehension check).
**H2b.** When asked to approve a request, at least half of patients will deselect one or more requested permissions.

### RD3 – Human–AI interaction for cognitive assistance

- **RQ3.1** How do photo browsing, text chat with source cards, and voice chat with read-aloud compare in task success, time and perceived workload?
- **RQ3.2** Do source cards (showing the memory an answer came from) increase correct recognition and trust calibration compared with text-only answers?

**H3a.** Voice + source cards will yield higher task completion than text-only chat for participants with lower literacy.
**H3b.** Source cards will reduce acceptance of incorrect answers in a planted-error condition. This condition is ethically sensitive and requires board approval and debriefing; an alternative is to run it with caregivers only.

### RD4 – Responsible AI in dementia support

- **RQ4.1** Does an evidence-constrained prompt with post-hoc claim verification, a repair step and a deterministic fallback reduce unsupported personal claims compared with the original prompt, and at what cost in helpfulness and latency?
- **RQ4.2** How often do people disagree with a facial-expression estimate of their mood when asked to confirm it?

**H4a.** The grounded pipeline will reduce replies with ≥ 1 unsupported personal claim by at least 50% relative to the original prompt on the held-out collection. The harness exists; it was not run because no API key was available.
**H4b.** The disagreement rate will be substantial (≥ 30%), consistent with Barrett et al. (2019) and Kim et al. (2021). The `agreedWithEstimate` field records exactly this.

## 3. Contributions (claimed vs. proposed)

| Type | Contribution | Status |
|---|---|---|
| Engineering | Consent-aware access-control model with role ceilings, representatives and an append-only audit log, in an open dementia-care codebase | **Implemented and tested** |
| Engineering | Grounded companion pipeline with deterministic safety layer, claim verifier, repair and fallback; works without an LLM | **Implemented**; logic tested with a fake LLM; real-LLM effect **not measured** |
| Empirical (preliminary) | Retrieval comparison on synthetic personal collections with a frozen held-out set | **Measured** (synthetic, single author) |
| Empirical (preliminary) | Finding: a multilingual embedding model does not help romanised Urdu queries | **Measured, exploratory** (n = 8 queries) |
| Design | Opt-in, confirm-before-save mood estimate | **Implemented**; effect unmeasured |
| Research (future) | Usability and comprehension of consent controls by people with dementia | **Proposed** |
| Research (future) | Human-rated groundedness of LLM replies | **Proposed** |

## 4. Methodology

1. **Offline (complete, extendable).**
   - Retrieval: `eval/runRetrievalEval.js`.
   - Companion: `eval/runCompanionEval.js`.
   - Next: a third, independently authored collection, written by 2–3 caregivers or clinicians from *fictional* personas, with double relevance judgement and Cohen's κ.
2. **Model-in-the-loop (next).**
   - Run the companion arms with the real LLM; 3 seeds.
   - Two blind raters, using the rubric in TESTING_AND_EVALUATION.md §4.
   - Report unsupported-claim rate, correct abstention, helpfulness and latency.
3. **Formative user study (after ethics approval).** The protocol is in TESTING_AND_EVALUATION.md §5: 12–16 dyads, within-subjects, three conditions, plus comprehension of consent controls.
4. **Ethics.**
   - Application to the institutional review board.
   - Capacity-aware consent following Appelbaum (2007) and Thorogood et al. (2018): information in plain language, a teach-back check, ongoing (process) consent, and caregiver co-consent where appropriate.
   - The data management plan specifies on-premises storage, pseudonymisation and deletion after the study.

## 5. Ethical concerns
- **Deception and attachment.** Cara must never pose as a person, and it now discloses that it is a computer helper. Emotional reliance on a chatbot still needs monitoring.
- **Planted memories.** Caregivers can add memories. Provenance labels mitigate this, but a *coercive* representative remains a risk.
- **Alert fatigue versus safety.** The urgent-message rules are crude. False negatives are dangerous, and false positives burden families.
- **Third-party processing.** LLM calls send minimal but real personal data to an external provider. Self-hosting a model should be evaluated.
- **Equity.** Voice recognition degrades for dementia-affected speech (Rudzicz et al., 2015) and for Urdu. Literacy affects text interfaces.

## 6. Timeline (indicative, toward Fall 2027 applications)

| Months | Work |
|---|---|
| 1–2 | Run the LLM companion evaluation; recruit 2–3 caregiver/clinician annotators for an independent collection; ethics application |
| 3–4 | Independent collection, double annotation, re-evaluation; romanised-Urdu experiments (transliteration, a lexicon learned from caregivers) |
| 5–7 | (If approved) formative usability study |
| 8 | Write-up as a workshop or short paper, e.g. an HCI/accessibility venue or a health-informatics conference. Submission is not guaranteed and needs supervisor guidance |
