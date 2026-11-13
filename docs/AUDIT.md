# VAMORA — Phase 1 Codebase Audit (baseline)

**Audited revision:** `fce8614` ("notification"), tagged `pre-research-baseline`.
**Audit date:** 2026-11-13. **Method:** I read every tracked source file: 37 commits, 138 files, about 9.5k lines of frontend code and 2.8k lines of backend source, plus 24 migrations and 7 seeders. I also ran `npm install`, `npm audit`, `vite build` and `eslint` on the baseline.

This document records the system **as it was** before the research-hardening work, so later changes can be judged against it. Severity uses: **Critical** (patient data exposure or account takeover), **High** (integrity loss or broken core workflow), **Medium**, **Low**.

---

## 1. Verified technology stack

| Layer | Claimed | Verified in code |
|---|---|---|
| Frontend | React + Vite | React 19.2, Vite 7.3, react-router 7, axios, recharts, lucide-react, face-api.js 0.22 |
| Backend | Node + Express | Express **5.2** (not 4), helmet, cors, morgan, multer 2, express-validator |
| DB / ORM | PostgreSQL + Sequelize | Sequelize 6.37 + sequelize-cli migrations; `pg` driver |
| Auth | JWT | `jsonwebtoken`, access + refresh tokens, bcryptjs (cost 10) |
| AI | Groq + Llama 3 | `groq-sdk`, model `llama-3.3-70b-versatile`, single system prompt |
| Mood camera | — | face-api.js TinyFaceDetector + FaceExpressionNet, in-browser |
| Tests | — | **None.** `npm test` exits 1 ("no test specified") |

## 2. Feature inventory

| Feature | Status | Evidence |
|---|---|---|
| Login / JWT / refresh | Implemented | `authService.js`, `api.js` interceptor |
| Self-registration | Implemented, **unsafe** | accepts `role: doctor/admin` (see S1) |
| Forgot/reset password | Partial | no email sending; token returned in API response outside production |
| Patient photo gallery (view) | Implemented | `PhotoGallery.jsx`, `GET /photos` |
| Patient photo upload | Backend only, **broken path** | stores `/uploads/photos/x`; gallery prefixes the path again → broken image (B4) |
| Caregiver adds photos for patient | Implemented | `POST /caregiver/patients/:id/photos` |
| Photo categories | Implemented | ENUM family/home/pet/memory |
| **Voice memory cues** | **Backend stub only** | `POST /photos/:id/voice` exists; no UI records or plays voice notes. CSS classes `.voice-btn` are unused |
| Written memories / people / places / routines | **Missing** | no model |
| AI companion "Cara" | Implemented | `companionRoutes.js`; context-stuffing prompt, no retrieval |
| Voice chat (STT/TTS) | **Missing** | — |
| Mood self-report | Implemented | `MoodCheckin.jsx` |
| Mood camera | Implemented, **scientifically over-claimed** | see A4 |
| Caregiver dashboard (patients, moods, notes, memories) | Implemented | `CaregiverDashboard.jsx` |
| Care notes (observations) | Implemented, **FK bug** | see B1 |
| Doctor portal: patients, appointments, medications, MMSE, team | Implemented | `doctorRoutes.js` |
| Notifications (mood alert, medication, check-up) | Implemented | `services/NotificationService.js` |
| Super-admin: create/lock/delete users | Implemented | `superAdminRoutes.js` |
| `isLocked` for doctors/caregivers | **Not enforced** | flag stored; never checked at login or in middleware |
| Consent / permissions / audit log | **Missing** | — |
| `media`, `chat_histories` tables | Dead code | models exist; nothing reads or writes them |
| `src/notifications/*` | Dead code duplicate | not mounted in `server.js` |
| `doctorService.js` (frontend) | Dead / wrong | calls endpoints that do not exist (`/doctor/patients/:id/assign`) |

## 3. Security and privacy findings

| # | Severity | Finding | Location |
|---|---|---|---|
| S1 | **Critical** | Public `POST /auth/register` accepts `role: "doctor"` or `"admin"`. Anyone can create a doctor account and, through S2, read **every patient's** records. | `validators.js:39`, `authService.register` |
| S2 | **Critical** | Doctors are not scoped to patients. `GET /doctor/patients` returns all patients in the system; every `/doctor/patients/:id/*` route accepts any id. Any doctor can also **delete any patient** together with all their data. | `doctorRoutes.js` |
| S3 | **Critical** | IDOR in caregiver routes: `GET /caregiver/patients/:id`, `/medications` and `POST /notes` do not check the caregiver–patient relationship. Any caregiver can enumerate ids and read any patient's moods, photos, appointments and medications. | `caregiverRoutes.js:119-217` |
| S4 | **Critical** | `DELETE /caregiver/notes/:noteId`, `DELETE /doctor/appointments/:id` and `DELETE /doctor/medications/:id` delete by id with no ownership check. | same files |
| S5 | **Critical** | `POST /caregiver/patients/add` lets any caregiver attach **any** patient by email, with no consent from the patient. This is the main family-misuse vector. | `caregiverRoutes.js:82` |
| S6 | **Critical** | All media is served by `express.static('/uploads')` with **no authentication**. Anyone who has the URL can fetch a patient's photo or recording. | `server.js:32` |
| S7 | High | JWT secrets fall back to hard-coded strings (`'your_super_secret_jwt_key'`), so tokens are forgeable whenever `.env` is missing. Refresh tokens are long-lived (30 d) and cannot be revoked. | `config/jwt.js` |
| S8 | High | Password-reset tokens are stored in plaintext and returned in the HTTP response whenever `NODE_ENV !== 'production'` (the default). | `authController.forgotPassword` |
| S9 | High | No rate limiting on login, reset or the LLM endpoint. This allows brute force and lets an attacker run up API cost. | — |
| S10 | High | 500 responses return `err.message` verbatim in every route, which leaks SQL and constraint details. The global handler also returns stack traces in development. | all routes |
| S11 | High | Admin and super-admin rights are not separated from clinical access. Super-admins can delete any user (`user.destroy()`), which cascades away patient media metadata with no recovery and no record. | `superAdminRoutes.js:245` |
| S12 | Medium | Upload filter checks only the client-supplied MIME type against a loose regex. The extension comes from the original name. There is no magic-byte check. | `upload.js` |
| S13 | Medium | Generated default passwords use `Math.random()` over 5×5×900 = 22,500 combinations, and are returned in API responses. | `doctorRoutes.js:12`, `superAdminRoutes.js:12` |
| S14 | Medium | No audit trail of who accessed which patient data. The super-admin "logs" page is only a list of registrations. | `superAdminRoutes.js:176` |
| S15 | Medium | The LLM prompt includes all 20 recent photo captions, 10 moods with notes and 10 chats on **every** request. That is more than the request needs (data minimisation) and sends it to a third-party API. | `companionRoutes.js` |
| S16 | Medium | The companion prompt instructs the model: *"Never say you are an AI model … You are simply Cara"*. This deceives a cognitively vulnerable user. | `companionRoutes.js:15` |
| S17 | Low | `npm audit`: 2 moderate (transitive `uuid` in Sequelize, v3/v5/v6-with-buffer paths that VAMORA does not use). | — |
| S18 | Low | Tokens are stored in `localStorage` (XSS-exposed). This is acceptable for the prototype but should be documented. | `authService.js` (frontend) |

## 4. Bugs and broken workflows

| # | Severity | Finding |
|---|---|---|
| B1 | **High (data integrity)** | `appointments.patient_id` and `care_notes.patient_id` have FKs to **`patients.id`**, but the code writes the patient's **`users.id`**. Inserts either fail on the FK or, when the two ids happen to coincide with another patient's row, silently attach a note or appointment to the **wrong patient**. Seed data masks this because user 1 is also patient 1. |
| B2 | High | Seeders cannot run: `sarah.md@vamora.com` is inserted by two seeders (unique violation). The media and chat seeders reference patients 2 and 3, which are never created. |
| B3 | High | `isLocked` is never enforced, so "locking" a doctor in the admin UI has no effect. |
| B4 | Medium | Patient-uploaded photo path is double-prefixed (`/uploads/photos//uploads/photos/x.jpg`). |
| B5 | Medium | `POST /photos` crashes with a 500 when no file is attached (`req.file` is undefined). |
| B6 | Medium | `POST /team/caregivers/link` with `patientId` **deletes all** caregiver relationships for the patient. The patient can only ever have one caregiver, and the relationship is replaced without notice. |
| B7 | Medium | The caregiver dashboard's "Delete photo" and the patient's delete button are missing; `DELETE /photos/:id` hard-deletes the DB row and leaves the file orphaned on disk. |
| B8 | Low | Doctor "cognitiveStatus" labels a single MMSE score below 18 as **"Declining"**. Decline is a change over time and cannot be inferred from one score. |
| B9 | Low | Hard-coded `http://localhost:5000` in two pages, so deployment breaks. |
| B10 | Low | `config.test.database` is `${undefined}_test` when `DB_NAME` is unset. |
| B11 | Low | 16 ESLint errors (unused vars, hooks dependencies). |

## 5. Database design problems

1. **Inconsistent patient key.** `Photos`, `Moods`, `ChatMessages`, `medications`, `mmse_scores` and `Notifications` key on `users.id`. `appointments`, `care_notes`, `media`, `chat_histories` and `patient_caregiver_relationships` key on `patients.id`. This is the root cause of B1 and makes every query error-prone.
2. **Mixed naming conventions**: `Photos`/`Moods` (PascalCase, camelCase columns) vs `care_notes` (snake_case).
3. `medications` and `mmse_scores` have **no FKs** at all (orphans possible) and no indexes on `patient_id`.
4. No index on `Photos.patientId`, `Moods.patientId`, `ChatMessages.patientId` or `patient_caregiver_relationships(patient_id, caregiver_id)`, and no uniqueness constraint on the relationship pair.
5. No doctor↔patient relationship except `patients.created_by_doctor_id`.
6. No soft delete or provenance (`uploaded_by`) on photos. Who added a memory is unknowable.

## 6. AI limitations

| # | Finding |
|---|---|
| A1 | **No retrieval.** The 20 most recent captions are pasted into the system prompt whatever the question. Older but relevant memories are invisible, and irrelevant ones add noise and cost. |
| A2 | **No grounding control.** Nothing stops the model inventing names, dates or events. The prompt even encourages emotional embellishment, and responses are not checked. |
| A3 | **No conversation structure.** History is flattened into the system prompt as text rather than passed as chat turns. The `max_tokens: 150` limit can truncate mid-sentence. |
| A4 | **Mood camera over-claims.** The UI says "Let your camera detect your mood". The result is saved automatically as the patient's mood (`source: camera`), triggers **caregiver alerts**, and feeds the "wellness score" on doctor and caregiver dashboards. Facial expression is not a reliable readout of internal emotion (see Barrett et al., 2019, in LITERATURE_REVIEW.md). FER models trained on young adults also degrade on older faces. |
| A5 | "Wellness score" is an unvalidated mapping (happy=10, sad=2 …) presented without qualification. |
| A6 | No timeout, retry or fallback. If the API key is missing the companion returns HTTP 500. Raw error messages are returned to the patient's UI. |
| A7 | No evaluation of any AI component. |

## 7. Accessibility and HCI problems

- Seconds ticking in the patient header is a constant distraction for users with attention difficulties.
- Emoji carry meaning without text equivalents in several places. The "🤖" avatar reinforces confusion about what Cara is.
- No voice input/output, even though it is the most accessible modality for many older adults.
- Companion replies are not linked to the photos they mention. The patient must *recall* rather than *recognise* (Nielsen's "recognition rather than recall").
- Destructive actions use `window.confirm` (small, easy to mis-tap). Several actions fail silently (errors only in the console).
- Inline styles with low-contrast pill buttons (`0.75rem` text) in the gallery.
- No language choice. Urdu is not supported anywhere, despite the deployment context (Pakistan).

## 8. Performance issues

- N+1 queries: `GET /caregiver/patients` and `GET /doctor/patients` run 2–4 queries per patient.
- Photos are served at full resolution. There are no thumbnails.
- The face-api models and recharts produce a >500 kB JS chunk; code splitting would help.

## 9. Research-contribution opportunities (identified at audit time)

1. **Grounded personal-memory retrieval.** Replace context stuffing with hybrid retrieval (lexical + dense + contextual signals) over a typed personal-memory store, and verify generated answers against the retrieved evidence. This is measurable offline (P@k, MRR, groundedness).
2. **Consent-aware, patient-centred access control for dementia care.** Fine-grained grants, consent-mode modelling (self / supported / representative), and a transparency log that is visible *to the patient*. The audit shows what happens without it: every role could see everything.
3. **Human-AI interaction for cognitive assistance.** Compare photo-anchored, voice and text interaction. The audit found voice was unimplemented.
4. **Responsible affect sensing.** Reframe the mood camera from "detection" to an optional, patient-confirmed estimate. The audit shows how unconfirmed inference propagated into clinical dashboards and alerts.

## 10. Prioritised roadmap (as planned at audit time)

| Priority | Work item | Addresses |
|---|---|---|
| P0 | Block privileged self-registration; enforce `isLocked`; require JWT secrets | S1, S7, B3 |
| P0 | Central access-control service; fix all IDOR/ownership checks; doctor↔patient scoping | S2–S5 |
| P0 | Authenticated media streaming (remove public `/uploads`) | S6 |
| P0 | Fix patient-key FK bug with a non-destructive migration | B1 |
| P1 | Consent & permission grants, caregiver access requests, consent modes, audit log, patient transparency view | S5, S11, S14 |
| P1 | Rate limiting, safe error handling, hashed reset tokens, crypto-random passwords, upload hardening | S8–S10, S12, S13 |
| P1 | Grounded RAG companion with verification, fallback, AI disclosure | A1–A3, A6, S15, S16 |
| P1 | Mood camera redesign (opt-in, confirm-before-save, no alerts from inference) | A4, A5 |
| P2 | Typed memory store (written/person/place/event/routine), voice notes UI, voice chat | §2 missing features |
| P2 | Patient privacy UI, accessible patient UI changes | §7 |
| P2 | Automated tests on real PostgreSQL; retrieval evaluation harness | no tests |
| P3 | Observation summarisation (AI-assisted, cited, non-diagnostic) | §4.D of brief |
| P3 | Research documentation package | — |

The status of each item after implementation is tracked in [`ROADMAP.md`](ROADMAP.md).
