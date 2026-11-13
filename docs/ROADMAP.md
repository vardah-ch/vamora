# Roadmap and Resume Notes

Status as of 2026-11-13, branch `research-hardening` (baseline: tag `pre-research-baseline` = `fce8614`).

## Done
| Priority | Item | Evidence |
|---|---|---|
| P0 | Privileged self-registration blocked; lock enforced; JWT hardening (no default secrets, typ/tv claims, revocation) | auth tests |
| P0 | Central access control; all IDOR and ownership fixes; doctor↔patient assignments | authorization tests |
| P0 | Private uploads with signed, re-authorised media URLs | authorization tests (media) |
| P0 | Patient-key FK bug (B1) fixed by a non-destructive migration | migration test |
| P1 | Access grants, consent modes, representatives, append-only audit, patient privacy API and UI | consent tests, browser check |
| P1 | Rate limits, safe errors, hashed reset tokens, random temporary passwords, magic-byte uploads | auth/authorization tests |
| P1 | Grounded companion (hybrid retrieval, verifier, repair, fallback, safety layer, honest identity) | companion tests, eval |
| P1 | Mood camera redesign (opt-in, confirm-before-save) | mood tests, browser check |
| P2 | Memory Book, voice notes UI, voice chat, Urdu option, text size, soft-delete restore | browser check |
| P2 | Test suite on real PostgreSQL; retrieval eval with frozen held-out set | `npm test`, `eval/results` |
| P3 | Non-diagnostic observation summaries | mood tests |
| P3 | Documentation package | `docs/` |
| — | Seeders made runnable (B2) and demo care-team seeder added | fresh-DB seed run |

## Remaining (in priority order)
1. **Run the LLM companion evaluation**: `GROQ_API_KEY=… node eval/runCompanionEval.js` on both collections; then human rating (TESTING_AND_EVALUATION.md §4).
2. **Move the browser workflow test into the repository** (`frontend/e2e/` with `playwright-core` as a dev dependency, plus a script that starts the servers) and add CI (GitHub Actions: `npm test` + build + lint).
3. **Caregiver and doctor UI**:
   - a caregiver Memory Book editor (the API exists);
   - a doctor UI for consent mode and the care-team list (the API exists);
   - show the observation summary in the dashboards (the API exists).
4. **Super-admin UI**: audit-log tab and doctor-assignment form (APIs exist).
5. **Security**: httpOnly cookie sessions with CSRF protection; MFA for clinicians and admins; email transport for password reset; a documented, verified erasure procedure.
6. **Romanised Urdu**: transliteration or normalisation, a caregiver-sourced lexicon, an Urdu-script test collection.
7. **Independent test collection** written by caregivers or clinicians (fictional personas), double-annotated.
8. **Ethics application** for the formative usability study.
9. Clean up the pre-existing lint findings in `CaregiverDashboard.jsx`, `AuthContext.jsx` and `PatientDashboard.jsx`.

## How to resume
```bash
git checkout research-hardening
cd backend && npm install && npm test        # should report 72 passed
cd ../frontend && npm install && npm run build
```
Read `docs/AUDIT.md` (baseline), then this file. Every design decision is documented in the module headers under `backend/src/`.
