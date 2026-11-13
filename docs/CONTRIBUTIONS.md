# Contributions, Assessment and Research Portfolio Summary

## 1. Authorship and provenance
- **Original system (commits up to `fce8614`, tag `pre-research-baseline`):** developed by **Vardah Ahmad** and **Amna Khan** as a Computer Science Final Year Project at the University of Gujrat. Git history attributes those 37 commits to the account `amnakhan4583-lgtm`.
- **Research-hardening work (branch `research-hardening`):** carried out in November 2026 with AI assistance (Claude) at the project owner's request. Commits carry a co-author trailer.

Anyone presenting this work, for example in applications, should describe the AI-assisted nature of these changes accurately. They should also be able to explain every design decision themselves.

## 2. What changed, by category

| Category | Contribution | Evidence |
|---|---|---|
| Security (engineering) | Closed 16 audited vulnerabilities, including 6 critical ones (privileged self-registration, cross-patient IDOR, unauthenticated media, unscoped deletes, silent caregiver attachment) | `docs/AUDIT.md`; `backend/test/auth.test.js`, `authorization.test.js` |
| Privacy architecture (engineering + design) | Permission-scoped grants, role ceilings, clinician-recorded representatives, "restriction always allowed", append-only audit log, patient-readable activity log | `accessControl.js`, `privacyRoutes.js`; `consent.test.js` |
| Data integrity | Found and fixed a latent FK bug that could attach notes to the wrong patient; non-destructive migrations proven on baseline-shaped data | `migration.test.js` |
| AI (engineering) | Typed personal-memory store; hybrid BM25 + local-embedding + context retrieval with abstention; grounded generation with verifier, repair and fallback; deterministic safety layer; non-diagnostic observation summaries | `backend/src/ai/`; `companion.test.js` |
| AI (empirical, preliminary) | Retrieval evaluation on synthetic dev and frozen held-out collections, with ablations and bootstrap CIs | `backend/eval/results/` |
| Responsible AI (design) | Mood camera redesigned to opt-in and confirm-before-save; honest machine identity; data minimisation toward the LLM | `MoodAssessment.jsx`, `moodRoutes.js`; `mood.test.js` |
| HCI (design) | My Privacy, Memory Book, source cards, voice in/out, Urdu option, text size, soft-delete recovery | Frontend; browser check (22/22) |
| Research documentation | Audit, literature review (verified references), proposal, evaluation protocol, limitations | `docs/` |

## 3. Honest assessment (as of 2026-11-13)

Scores use a 1–5 scale: 1 = absent, 3 = adequate for an undergraduate project, 5 = publication or production quality.

| Dimension | Before | After | Justification |
|---|---|---|---|
| Engineering quality | 2 | **3.5** | Clear layering, central authorisation, migrations, 72 integration tests on real PostgreSQL. Held back by: no CI, no frontend tests, some legacy dashboard code still large and loosely structured. |
| AI implementation | 1.5 | **3.5** | Retrieval, grounding, safety and fallback are implemented and partly measured. The real-LLM effect is unmeasured; the verifier is heuristic; Urdu support is weak. |
| Research depth | 1 | **3** | Verified literature, explicit gaps, falsifiable hypotheses, dev/held-out protocol. But all evidence is synthetic and single-author, and there are no human studies. |
| Privacy and security | 1 | **4** | A consent model rarely seen in student projects, verified by tests. Remaining: tokens in localStorage, no MFA, no legal review. |
| HCI and accessibility | 2 | **3** | Thoughtful patient flows and accessibility basics. No WCAG audit and no user testing. Caregiver and doctor dashboards only lightly revised. |
| Reproducibility | 1.5 | **4** | Tests run with one command on real PostgreSQL; eval scripts, data hashes, fixed seeds and committed results. Not containerised. |
| Graduate research readiness | 1.5 | **3** | A credible foundation and a clear research agenda. To be competitive it needs the LLM evaluation, an independent test collection, and ideally an ethics-approved formative study or a co-authored workshop paper. |

## 4. From a supervisor's perspective

**What makes it technically credible.** The claims are tied to tests and committed results. Negative findings are reported: no significant gain over lexical retrieval, poor retrieval-level abstention, no help from multilingual embeddings for Roman Urdu. The held-out set was frozen before tuning.

**Defensible contributions.**
1. An open, tested consent-aware access model for dementia-care software (RD2). This is the most distinctive contribution.
2. A grounded, abstaining personal-memory QA pipeline with an evaluation harness (RD1/RD4).
3. An empirical observation about romanised-Urdu retrieval (G2).

**Needs stronger experimentation.** Real-LLM groundedness with human raters. An independent collection. Verifier precision and recall. Any user study.

**Needs more literature support.** Romanised-Urdu or code-switched IR. Supported decision-making in South Asian family contexts. Evaluation of explanation interfaces (source cards) for cognitively impaired users.

**Strongest fit.** HCI/accessibility with health informatics (RD2 + RD3), or applied NLP/IR for low-resource personal retrieval (RD1 + G2). Responsible AI runs through both.

**Before considering publication.** Run H4a; build and annotate an independent collection; obtain ethics approval and run at least a small formative study, or partner with a clinical group. Get supervisor guidance on venue: an accessibility or HCI late-breaking track, or a health-informatics workshop, are realistic first targets.

## 5. Research portfolio summary (for conversations with professors)

> **VAMORA: grounded, consent-aware memory assistance for people living with dementia.**
> VAMORA began as our undergraduate final-year project at the University of Gujrat: a web app in which people with dementia, their caregivers and doctors share photos, memories and observations, with an LLM companion. An audit found that the original companion pasted recent memories into an LLM prompt with no grounding. It also found that any caregiver or doctor could read any patient's data.
>
> I then re-engineered it around two questions. First, can an assistant answer *personal* memory questions only from the person's own evidence, and say "I don't know" otherwise? I built hybrid retrieval over a typed memory store, combining BM25, local embeddings and time and person context, plus a claim-checking, fall-back generation pipeline. On synthetic collections with a frozen held-out set, retrieval improved MRR@5 from 0.02 to 0.83 over the original approach. It was not significantly better than a strong lexical baseline. Retrieval alone could not detect unanswerable questions, and multilingual embeddings did not help Roman-Urdu queries. Second, how can families collaborate without overriding the person's autonomy? I implemented permission-scoped, patient-approved sharing with clinician-recorded representatives, a rule that the person can always restrict sharing, and an access log they can read. This is verified by 72 integration tests.
>
> Nothing has yet been tested with patients. My next steps are an LLM groundedness evaluation with human raters, an independently written test collection, and, with ethics approval, a small usability study. I am interested in HCI and responsible NLP for health, particularly for low-resource languages.

*(Edit to your own voice. Only state what you can explain and defend in an interview.)*
