# Architecture

## 1. System overview

```
┌───────────────────────── Browser (React 19 + Vite) ─────────────────────────┐
│ Patient: Dashboard · My Photos · Memory Book · Talk with Cara · Mood ·      │
│          My Privacy                                                         │
│ Caregiver dashboard · Doctor dashboard · Super-admin dashboard              │
│ In-browser only: face-api.js mood estimate · Web Speech (STT/TTS)           │
└──────────────┬───────────────────────────────────────┬─────────────────────┘
               │ JSON + Bearer JWT                     │ <img>/<audio> signed URLs
┌──────────────▼───────────────────────────────────────▼─────────────────────┐
│ Express 5 API (backend/app.js)                                              │
│  requestId · helmet · CORS · rate limits · central errorHandler             │
│  routes/ ─► services/accessControl (permission check per patient) ─► audit  │
│  ai/: safety → retriever (BM25 + local embeddings + context) → llm →        │
│       grounding verifier                                                    │
└──────────────┬──────────────────────────────┬──────────────────────────────┘
               │ Sequelize 6                  │ HTTPS (only top-k memories)
        ┌──────▼───────┐               ┌──────▼──────┐
        │ PostgreSQL   │               │ Groq API    │ (optional; system works without it)
        │ + private    │               └─────────────┘
        │   uploads/   │
        └──────────────┘
```

## 2. Backend layout (`backend/`)

| Path | Responsibility |
|---|---|
| `app.js` / `server.js` | App composition (importable for tests) / process entry |
| `src/middlewares/auth.js` | JWT verification (type, version, lock, active) and role gate |
| `src/middlewares/upload.js` | Private storage, magic-byte verification |
| `src/services/accessControl.js` | Permission catalogue, role ceilings, `getAccess`, `requirePermission`, `sharingAuthority` |
| `src/services/auditService.js` | Append-only audit writes (never throws) |
| `src/services/memoryLibrary.js` | Photos, voice notes and memory items with visibility, provenance and soft-delete rules |
| `src/services/mediaService.js` | Signed media URLs |
| `src/services/careMetrics.js` | Self-report-only mood average; MMSE bands and trend |
| `src/services/careTeam.js`, `NotificationService.js` | Relationship sync; consent-aware alerts |
| `src/ai/*` | Retrieval, generation, verification, safety, summaries (see AI_METHODOLOGY.md) |
| `src/routes/*` | HTTP endpoints (see §4) |
| `migrations/` | Schema history; **only additive, non-destructive changes after the baseline** |
| `test/` | Jest + Supertest on embedded PostgreSQL |
| `eval/` | Offline retrieval and companion evaluation |

## 3. Data model

### 3.1 Key convention
**Patient-scoped rows key on the patient's `users.id`.** Before the fix, `appointments` and `care_notes` had foreign keys to `patients.id` while the code wrote `users.id` (audit bug B1). Migration `20261113000001` re-pointed those foreign keys after checking every existing value.

Route parameters named `patientId` in caregiver and doctor URLs carry **`patients.id`**, because the existing frontend uses it. The API resolves it to `users.id` and then checks permissions.

### 3.2 Tables

| Table | Purpose | Added in |
|---|---|---|
| `users` (+`token_version`) | Accounts and roles | baseline (+ research) |
| `patients` (+`consent_mode`, `representative_*`, `preferences`) | Patient profile | baseline (+ research) |
| `caregivers`, `doctors` | Profiles (+`is_locked`) | baseline |
| `patient_caregiver_relationships` | Care-team membership (kept in sync with grants) | baseline |
| **`access_grants`** | Consent-aware permissions per (patient, grantee) | research |
| **`doctor_patient_assignments`** | Clinical care-team membership | research |
| **`audit_events`** | Append-only access log (trigger-protected) | research |
| `Photos` (+provenance, `mimeType`, voice fields, `deletedAt`) | Photo memories and voice notes | baseline (+ research) |
| **`memory_items`** | Typed memories: person/place/event/routine/written | research |
| **`memory_index`** | Cached embeddings (JSONB) keyed by content hash and model | research |
| `Moods` (+`inference`) | Self-reported moods; confirmed camera estimates | baseline (+ research) |
| `care_notes` (+`category`, `retracted_*`) | Observations (append-only by policy) | baseline (+ research) |
| `appointments`, `medications`, `mmse_scores` | Clinical records | baseline |
| `ChatMessages` (+`metadata`) | Conversation, with grounding status and sources | baseline (+ research) |
| `Notifications` (+5 types) | In-app notifications | baseline (+ research) |
| `media`, `chat_histories` | **Legacy, unused** (kept; not dropped) | baseline |

Indexes were added for every patient-scoped lookup. Partial unique indexes allow only one *open* grant and one *active* assignment per pair.

## 4. API reference (v1)

All endpoints return JSON. Errors have the form `{status:'error', message, requestId}`. "P" means a patient-data permission is checked.

**Auth** `/api/v1/auth`

| Endpoint | Notes |
|---|---|
| `POST /register` | Patient or caregiver only |
| `POST /login` | |
| `POST /refresh` | |
| `POST /logout` | Revokes all sessions |
| `GET /me` | |
| `POST /forgot-password` | |
| `POST /reset-password` | |

**Patient self**

| Endpoint | Notes |
|---|---|
| `GET/POST /photos` | List / upload |
| `GET /photos/removed` | Recently removed photos |
| `POST /photos/:id/restore` | |
| `POST /photos/:id/confirm` | Confirm a helper-added photo |
| `POST /photos/:id/voice` | Any role with `voice.upload` |
| `DELETE /photos/:id` | Soft delete; owner, uploader or `memories.delete` |
| `GET/POST /memories` | |
| `GET /memories/search?q=` | Explains what Cara would retrieve |
| `PATCH /memories/:id` | |
| `POST /memories/:id/confirm` | |
| `POST /memories/:id/restore` | |
| `DELETE /memories/:id` | |
| `GET/POST /moods` | `source` is `manual` or `camera_confirmed` only |
| `POST /companion/chat` | → `{reply, sources[], grounding}` |
| `GET/DELETE /companion/history` | |
| `GET /caregiver/my-appointments` | |
| `GET /doctor/my-medications` | |

**Privacy** `/api/v1/privacy` (patient, or recorded representative with `?patientId=`)

| Endpoint | Notes |
|---|---|
| `GET /overview` | Grants, clinicians, authority, permission catalogue, preferences |
| `POST /grants` | Proactively share with a caregiver or the patient's doctor |
| `POST /grants/:id/approve` | Optional reduced permission list |
| `POST /grants/:id/decline` | |
| `PUT /grants/:id/permissions` | |
| `POST /grants/:id/revoke` | |
| `POST /grants/:id/reviewed` | |
| `GET /activity` | Plain-language audit log |
| `GET/PUT /preferences` | `textSize`, `readAloud`, `language`, `moodCameraOptIn` |

**Media** `/api/v1/media/{photo|voice}/:id?u&e&s`: signed, re-authorised on every fetch.

**Caregiver** `/api/v1/caregiver`

| Endpoint | Notes |
|---|---|
| `GET /patients` | Active and pending |
| `POST /patients/add` | Creates an access *request* |
| `GET /patients/:patientId` | P: sections depend on the grant |
| `GET /patients/:patientId/medications` | P `clinical.view` |
| `POST /patients/:patientId/notes` | P `observations.create` |
| `DELETE /notes/:noteId` | Author retract |
| `GET /patients/:patientId/observation-summary` | P |
| `GET/POST /patients/:patientId/photos` | P |

**Doctor** `/api/v1/doctor`

| Endpoint | Notes |
|---|---|
| `GET /patients` | Assigned patients only |
| `GET /patients/:id` | P |
| `DELETE /patients/:id` | Ends *own* assignment; does not delete the patient |
| `GET /caregivers` | Caregivers linked to this doctor or on its patients' care teams |
| `POST /patients/:id/appointments` | P `clinical.manage` |
| `DELETE /appointments/:id` | P `clinical.manage` |
| `POST/GET /patients/:id/medications` | P |
| `DELETE /medications/:id` | P |
| `POST/GET /patients/:id/mmse` | P |
| `GET /patients/:id/observation-summary` | P |
| `PUT /patients/:id/consent-mode` | |
| `POST /team/patients` | Creates a patient and the assignment |
| `POST /team/caregivers/link` | `{email, patientId?}` |

**Super-admin** `/api/v1/super-admin`

| Endpoint | Notes |
|---|---|
| `POST /doctors`, `POST /caregivers`, `POST /patients` | Create accounts |
| `GET /users` | |
| `GET /logs` | |
| `GET /audit` | Metadata only |
| `PATCH /{doctors,caregivers}/:userId/lock` | |
| `DELETE /users/:id` | Deactivate |
| `PATCH /users/:id/reactivate` | |
| `POST /assignments` | Assign a doctor to a patient |

**Notifications** `/api/v1/notifications`: `GET /`, `PATCH /read-all`, `PATCH /:id/read`.

## 5. Frontend
React Router routes are guarded by role. New patient pages: `MyPrivacy`, `MemoryBook`, plus rewritten `PhotoGallery` and `TalkToCompanion`. New hooks:

- `useSpeech`: Web Speech recognition and synthesis, English and Urdu;
- `usePreferences`: server-stored preferences, with text size applied to `<html data-text-size>`.

`services/media.js` resolves signed media paths against the API origin.

### HCI decisions (and where)
| Principle | Implementation |
|---|---|
| Recognition over recall | Memory source cards with photos under Cara's answers; Memory Book grouped by type; routine list sorted by time |
| Minimal distraction | Clock updates per minute (the ticking seconds were removed); one primary action per card |
| Error prevention and recovery | Confirmation in plain words before removing; 30-day "Recently removed"; "Withdraw" instead of delete for notes |
| User control and transparency | My Privacy (share less / stop sharing), activity log, "Added by a helper" labels |
| Accessibility | ≥48 px targets on new screens; visible focus rings; `aria-live` chat; labelled controls; text-size preference; reduced-motion support for the mic animation; voice in/out |
| Honest uncertainty | Status notes such as "Cara could not find this in your saved memories"; mood camera framed as a guess |

## 6. Configuration (`backend/.env`)
| Variable | Default / notes |
|---|---|
| `DB_*` | PostgreSQL connection |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | **Required in production** (≥32 chars) |
| `JWT_EXPIRE` / `JWT_REFRESH_EXPIRE` | `1h` / `7d` |
| `GROQ_API_KEY`, `GROQ_MODEL` | Optional; without a key the companion runs retrieval-only |
| `EMBEDDINGS` | `on` (default) / `off` |
| `EMBEDDING_MODEL` | `Xenova/all-MiniLM-L6-v2` |
| `DENSE_MIN_SIMILARITY` | `0.35` |
| `UPLOAD_PATH` | `./uploads` (private) |
| `MEDIA_URL_TTL_SECONDS` | `600` |
| `CORS_ORIGIN` | Comma-separated |
| `TRUST_PROXY` | `true` behind a reverse proxy |
| Rate limits | `LOGIN_RATE_LIMIT`, `AI_RATE_LIMIT`, `REGISTER_RATE_LIMIT`; `DISABLE_RATE_LIMIT` is for development only |
