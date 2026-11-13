# Testing and Evaluation

This document separates **what was actually executed** (§1–3) from **studies that are proposed but not conducted** (§4–5). No participant data exists. No usability, clinical or user-facing results are claimed.

## 1. Automated backend tests (executed)

- **Stack:** Jest 29 and Supertest, running against **real PostgreSQL 16.14** (the `embedded-postgres` package runs the official binaries). The schema is built by the same `sequelize-cli db:migrate` used in deployment. Tests run with no LLM and no embeddings, so they are deterministic and offline.
- **Command:** `cd backend && npm test`
- **Result on 2026-11-13:** **72 tests in 6 suites, all passing.**

| Suite | Tests | What it verifies |
|---|---|---|
| `auth.test.js` | 13 | No privileged self-registration (S1); password policy; self-registered caregiver sees no one; uniform login errors; lock enforced at once (B3); logout revokes access and refresh tokens (S7); refresh ≠ access; forged token with the old default secret rejected; reset token never returned and stored hashed (S8); login rate limit (S9); no internal error leakage (S10); login audited without the password; **audit table rejects UPDATE/DELETE**; profiles self-only, including for admins |
| `authorization.test.js` | 21 | IDOR: caregiver cannot read, write or list another patient by id (S3) and denials are audited; caregiver sees only granted sections; note retraction author-only and non-destructive (S4); add-by-email is a pending request with no access (S5) and does not reveal account existence; doctors see only assigned patients (S2); doctors cannot delete patients or others' medications; doctor assignment excludes media/voice/chats; admins have no patient-data access (S11); admin delete = deactivate; role ceilings; malformed ids → 400; patient-only endpoints; **media**: no public `/uploads`, signed URL works, tampered/foreign/expired URL rejected, revocation applies immediately, fake image rejected (S12), missing file → 400 (B5) |
| `consent.test.js` | 14 | Patient approves with fewer permissions; `consent.manage` cannot be self-granted; restrict/revoke with notification; activity log in plain language; caregivers cannot use the privacy API; representative mode needs a basis and care-team membership; representative gets full authority, patient keeps restrict-only; revoking the representative alerts the clinician; clinician-linked caregiver has no media access and is flagged for review; a second caregiver does not remove the first (B6); preference validation; **family misuse**: helper-added items unconfirmed and attributed, uploader-only visibility, no deleting others' items, notified soft-delete and restore, photo restore, voice needs `voice.view` |
| `companion.test.js` | 15 | Verifier unit tests (accepts grounded text; flags invented names, places and years; detects dosing); retrieval-only mode works without a key; abstains on unknown memory; grounded LLM reply accepted, **prompt contains only retrieved memories** and no "never say you are an AI"; **hallucinated reply repaired once then replaced**; successful repair; LLM outage → fallback, not 500; unconfirmed memories disclosed; urgent message bypasses the LLM and alerts permitted caregivers; "help me remember" not urgent; medical/identity rules; history metadata and erasure; routine retrieval by time of day |
| `mood.test.js` | 8 | Unconfirmed camera saves rejected; confirmed estimate stored separately with `agreedWithEstimate`; invalid moods rejected; alerts only to caregivers with `alerts.receive`; legacy camera rows excluded from averages; single MMSE score shown as a band, trend needs two scores; observation summary is labelled non-clinical and excludes retracted notes; narrative with unknown citations or diagnostic language rejected |
| `migration.test.js` | 1 | On a database migrated only to the **baseline** schema and filled as the baseline code wrote it: confirms that bug B1 exists (FK violation); applies the new migrations; **all rows preserved**; legacy caregiver relationships become `active` grants flagged for review; doctor assignment backfilled; B1 fixed; newest migration can be undone and re-applied |

The LLM is replaced in tests by a scripted fake client. These tests therefore verify the *control logic* (verification, repair, fallback), not the behaviour of a real model.

**Not covered by automated tests:** frontend unit tests; load and performance tests; a real LLM; real speech recognition; real camera inference; S13 (temporary-password strength).

## 2. Browser workflow test (executed)

Headless Microsoft Edge (via `playwright-core`) ran against the real frontend (Vite) and backend, using a fresh database migrated and seeded with the demo seeders. **22 of 22 checks passed** on 2026-11-13, with no uncaught page errors in any role. The script lived in the session scratchpad and is not yet part of the repository (see ROADMAP).

| Role | Workflow checked |
|---|---|
| Patient | Dashboard shows six large cards and a clock without seconds; My Privacy lists the caregiver and the doctor's limits; text-size preference applies; Memory Book shows seeded people and flags the helper-added routine; adding a person works; uploading a photo works and it **renders through a signed URL**; Cara answers "Who is Amna?" with a **source card**; Cara says "I'm not sure" for an unknown trip; the mood camera shows the opt-in screen first |
| Caregiver | Sees the patient; request-access form present; can view the patient's photo (holds `memories.view`) |
| Doctor | Sees the assigned patient; UI says "Remove from list", not "Delete" |
| Super-admin | Dashboard loads |

All seeders also ran successfully on a fresh database. They failed at baseline (B2).

## 3. AI evaluation (executed, synthetic data)
See AI_METHODOLOGY.md §4–5 for the full tables. In brief, on the held-out set:

- hybrid MRR@5 = **0.833**, vs **0.018** for the original recency approach (difference 0.815, 95% CI [0.700, 0.916]);
- not significantly better than lexical + context;
- retrieval-level abstention on out-of-collection queries: **0/4**.

The LLM arms of the companion evaluation were **not run** because no API key was available.

### How the test collections were created
1. Two fictional personas were written by the developer, with typed memories and photo captions.
2. Queries were written in six kinds, avoiding the memories' exact wording for paraphrase queries.
3. Graded relevance (0/1/2) was assigned by the same author.
4. The held-out set was hashed and committed before any dev-motivated change.

**Bias risk:** a single author wrote the system, the data and the judgements. This is the main threat to validity (RESEARCH_LIMITATIONS.md).

## 4. Proposed AI evaluation still to run (not conducted)
1. **Companion arms with a real LLM** (`runCompanionEval.js`) on both collections, with 3 runs to estimate variance.
2. **Human rating** of replies by two independent raters blind to the arm, using a rubric:
   - groundedness (every personal claim supported? yes/partly/no);
   - harmful confabulation (yes/no);
   - appropriate uncertainty (1–3);
   - clarity for a person with dementia (1–5);
   - warmth (1–5).
   Report Cohen's κ, and resolve disagreements by discussion.
3. **Claim-level factuality**: split replies into atomic claims and check each against the persona (in the style of FActScore; Min et al., 2023).
4. **Independent test collection** written by caregivers or clinicians (synthetic personas, not real patients), with relevance judged by people who did not build the system.

## 5. Proposed usability study (protocol draft; not conducted)

> **No participants have been recruited. This study must not start without approval from the University of Gujrat ethics review board (or the equivalent), a capacity-aware consent process, and caregiver co-consent where appropriate.**

**Design.** Within-subjects, counterbalanced. Three interaction conditions for retrieving a memory:

- **A**: photo browsing;
- **B**: text chat with source cards;
- **C**: voice chat with source cards and read-aloud.

**Participants.**
- 12–16 dyads: a person with mild Alzheimer's-type dementia (clinician-confirmed, mild stage) plus a family caregiver.
- 8 additional caregivers for the caregiver dashboard and privacy flows.
- Exclusions: severe visual or hearing impairment not corrected; inability to give consent with support.

**Materials.** Each dyad builds a small *personal* memory library with the researcher (e.g. 15 items). This data is deleted after the study unless the participant consents to keep it.

**Tasks.**
1. Find who a named person is.
2. Find what to do now (routine).
3. Find a photo of an event.
4. Caregiver: request access, then patient: approve with fewer permissions.
5. Patient: stop sharing.
6. Patient: read the activity log.

**Measures.**
- Task completion (yes / with help / no) and time on task.
- Navigation errors (wrong screen visits).
- Comprehension check after each task ("Who can now see your photos?").
- Adapted SUS (with simplified wording; Bangor et al., 2008, benchmarks used cautiously).
- Simplified NASA-TLX (3 subscales, pictorial).
- Satisfaction with a 5-point smiley scale.
- Short semi-structured interview.
- For the mood camera (opt-in only): agreement rate between estimate and self-report.

**Analysis.**
- Descriptive statistics and Friedman tests across conditions, treated as exploratory given the sample size.
- Thematic analysis of interviews.
- Pre-registration of hypotheses H3a–H3b (RESEARCH_PROPOSAL.md) before data collection.

**Safeguards.**
- Sessions ≤ 45 minutes with breaks; stop at any sign of distress.
- A caregiver present.
- No real clinical decisions are based on the system.
- Data pseudonymised and stored encrypted; audio recordings only with separate consent.
- Right to withdraw and have data deleted.
