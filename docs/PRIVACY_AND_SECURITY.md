# Privacy, Consent and Security

VAMORA holds some of the most personal information a person has: family photographs, voice recordings, memories, moods, and notes written about them by others. Many of its users have impaired memory. In this design, privacy is an architectural requirement, not a feature.

> **Legal note.** VAMORA's software can *record* consent arrangements, but it cannot *establish* legal authority or capacity. It has not been reviewed against Pakistani law (e.g. the Mental Health Ordinance 2001 and any personal data protection legislation in force), GDPR or HIPAA. A legal and clinical-governance review is required before any real deployment.

## 1. Threat model

| Actor | Example misuse | Primary controls |
|---|---|---|
| Anonymous internet user | Guess media URLs; brute-force logins; register as a doctor | No public media; signed expiring URLs; rate limits; privileged roles cannot self-register |
| Authenticated user of another role | Change an id in a URL to read another patient (IDOR) | Every patient route resolves the patient and checks a **permission** for the caller |
| **Family member / caregiver** | Read private photos, delete memories, plant false memories, read chats, alter notes | Patient-approved, per-permission grants; provenance; soft delete with patient notification and restore; author-only retraction of notes; chats never shared by default |
| Doctor | Browse patients they do not treat; read photos and chats | Explicit care assignment; the assignment grants clinical data only, not media or chats |
| Administrator | Read patient media because they hold "admin" | Admin roles have **zero** patient-data permissions; "delete" only deactivates |
| Compromised token | Continued access after logout or lock | Short access-token lifetime (1 h); `tokenVersion` revocation on logout, password change and lock |
| Malicious upload | Script disguised as an image | Magic-byte verification; random names; extensions from the detected type; no SVG/HTML |
| Third-party AI provider | Receives more personal data than needed | Only the top-4 relevant memories and the first name are sent; embeddings computed locally |

## 2. Authorisation model

**Principles:** deny by default; least privilege; role ceilings; patient authority; full auditability. The implementation is `backend/src/services/accessControl.js`.

### 2.1 Permission catalogue
| Permission | Meaning |
|---|---|
| `memories.view` | See all photos and memories |
| `memories.upload` | Add photos/memories (always able to see one's *own* uploads) |
| `memories.delete` | Remove items added by others |
| `voice.view` / `voice.upload` | Listen to / add voice recordings |
| `mood.view` | See self-reported moods |
| `observations.view` / `observations.create` | Read / write care notes |
| `clinical.view` / `clinical.manage` | See / add appointments, medications, MMSE |
| `alerts.receive` | Receive low-mood and help-request alerts |
| `ai.history.view` | Read conversations with Cara |
| `consent.manage` | Manage sharing on the patient's behalf (representatives only) |

### 2.2 Where access comes from
| Who | Basis | Default permissions |
|---|---|---|
| Patient (self) | identity | all except `clinical.manage` |
| Doctor | active `doctor_patient_assignments` row | `clinical.view`, `clinical.manage`, `mood.view`, `observations.view`. **No media, voice or chats** unless the patient grants them |
| Caregiver added by a clinician | `access_grants`, basis `clinician_assignment`, flagged *needs review* | `clinical.view`, `mood.view`, `observations.view/create`, `memories.upload`, `alerts.receive` |
| Caregiver who requested access | `access_grants`, status `pending` until the patient approves | Exactly what the patient ticks (can be fewer than requested) |
| Pre-existing caregiver relationships | migrated grants, basis `legacy_assignment`, *needs review* | What they could functionally do before (so nothing broke); the patient is prompted to review |
| Admin / super-admin | — | **none** (role ceiling is empty) |

**Role ceilings.** Grants are filtered by role on every check. A caregiver can never hold `clinical.manage`, and an admin can never hold anything, even if the database is edited.

### 2.3 Consent modes and decision authority
`patients.consent_mode`:

- **self**: the patient decides.
- **supported**: the patient decides with help. Software rights are identical to *self*; the mode documents the arrangement.
- **representative**: a **doctor records** that a named caregiver (already on the care team) holds decision authority, with a written basis (minimum 15 characters, e.g. *"LPA (health) ref …, seen in clinic on …"*). That caregiver gains `consent.manage`.

**Rule: restriction is always allowed; expansion requires authority.**

| | Grant new / expand | Restrict / revoke | View log |
|---|---|---|---|
| Patient (self/supported) | ✔ | ✔ | ✔ |
| Patient (representative mode) | ✘ (asks the representative) | **✔ always** | ✔ |
| Recorded representative | ✔ | ✔ | ✔ |
| Anyone else | ✘ | ✘ | ✘ |

This rule follows the literature: capacity is decision-specific (Appelbaum, 2007), and supported decision-making with representatives is recommended (Thorogood et al., 2018). A diagnosis never removes the person's ability to say "stop". If the patient revokes their representative, every assigned clinician is notified to review the arrangement.

### 2.4 Media
- Files are stored outside any static route.
- APIs return URLs of the form `/api/v1/media/{photo|voice}/:id?u=&e=&s=`. The HMAC-SHA256 signature binds the media kind, photo id, viewer and expiry; the default lifetime is 10 minutes.
- On **every fetch** the server re-checks that the viewer's account is active and unlocked, and that they still hold the permission. Revocation therefore takes effect immediately, which an automated test verifies.
- Responses carry `Cache-Control: private` and `Content-Disposition: inline`. Every non-self view is audited.

### 2.5 Family-misuse controls (implemented)
| Scenario | Control |
|---|---|
| Access photos without permission | `memories.view` must be granted by the patient; uploaders without it see only their own uploads |
| Delete important memories | Others' items need `memories.delete`; all deletions are soft for 30 days; the patient is notified and can restore |
| Plant or alter memories | Items added or edited by others are `patientConfirmed = false`, shown as "Added by a helper", and disclosed by Cara |
| Share private recordings | Voice needs a separate `voice.view`; signed URLs expire; access is logged |
| Manipulate observations | Notes cannot be edited; only the author can *retract* them (hidden, kept, audited); authorship recorded |
| Access for unrelated purposes | Purpose-specific permissions; patient-visible activity log; admins excluded |
| Silent caregiver attachment (baseline S5) | Requests are pending until approved; the response does not reveal whether an account exists |

**Remaining limitations** (see RESEARCH_LIMITATIONS.md):

- someone holding `memories.view` can still screenshot a photo;
- a malicious *representative* has broad authority (mitigated by clinician recording, patient restriction and notifications, but not eliminated);
- coercion of the patient in person cannot be detected by software;
- the activity log helps only if someone reads it.

## 3. Audit logging
`audit_events` records the actor id and role, the action, the resource type and id, the patient, the outcome (`allowed`/`denied`/`error`), the access basis, the grant id and the request id.

- **No content is ever stored**: no captions, notes, chat text or media.
- A PostgreSQL trigger rejects `UPDATE` and `DELETE` on the table, so the log is **append-only at the database level**. An automated test verifies this.
- A DBA can still drop the trigger. A production deployment should ship logs to write-once storage.
- Patients (and representatives) read their log in plain language at **My Privacy → Who looked at or changed your information**.
- Super-admins see metadata only through `/super-admin/audit`.

## 4. Security controls (verified by tests unless noted)

| Area | Control |
|---|---|
| Registration | Only `patient`/`caregiver` can self-register; others are created by a super-admin |
| Passwords | bcrypt cost 12 (production), minimum 8 characters including a digit; generated temporary passwords use `crypto.randomBytes` (~70 bits) |
| JWT | HS256 with `issuer` set; `typ` claim (access ≠ refresh); `tv` claim checked against `users.token_version`; access 1 h, refresh 7 d; **no hard-coded fallback secrets** (production refuses to start without ≥32-character secrets) |
| Account lock | Enforced at login, on every request, at refresh and on media fetch; locking ends sessions immediately |
| Password reset | Token stored as SHA-256 only; 30-minute expiry; never returned by the API (unless a developer sets `DEV_EXPOSE_RESET_TOKEN=true` outside production); revokes sessions |
| Rate limits | Login 10 per 15 min per IP+email; reset 5/h; registration 20/h; AI chat 20/min per token |
| Errors | Central handler: 4xx messages are safe; 5xx returns a generic message plus a request id; no stack traces; no request bodies logged |
| Logging | Request logs exclude query strings (signed URLs) and bodies |
| Input | Strict integer/UUID parsing of ids; whitelist validation of enums; length limits; JSON body limit 100 kB |
| Uploads | ≤10 MB, one file; magic-byte check for JPEG/PNG/GIF/WebP and WebM/OGG/WAV/MP3/M4A |
| Headers | helmet; `x-powered-by` disabled; CORS restricted to configured origins |
| Login enumeration | Uniform error message; constant-time-ish comparison against a dummy hash for unknown emails |

**Not done (documented):**

- tokens live in `localStorage` (move to httpOnly cookies + CSRF protection);
- no MFA;
- no encryption at rest beyond what the disk or database provides;
- no malware scanning of uploads;
- no automated dependency patching (two moderate `npm audit` findings in Sequelize's transitive `uuid`, in code paths VAMORA does not call).

## 5. Data minimisation and third parties
| Data | Leaves the server? |
|---|---|
| Embeddings | No; computed locally |
| Chat with Cara | Yes, to Groq: only the patient's **first name**, the current message, the last ≤6 turns (each ≤600 characters) and the **≤4 retrieved memories** |
| Speech recognition | The browser vendor's service may process audio (Chrome/Edge). The UI says so. Read-aloud is on-device |
| Camera frames | Never; analysed in the browser and discarded |
| Unconfirmed camera estimates | Never stored, locally or remotely |

Patients can clear their conversation history (`DELETE /companion/history`). Full account erasure is intentionally **not** an admin one-click action. It must follow a verified request from the patient or their representative; this procedure still needs to be written.

## 6. Mapping to baseline audit findings
Fixed and covered by an automated test: S1–S12, S14, S15, S16.

S13 (weak generated passwords) is fixed in code (`generateTemporaryPassword`) but has no dedicated test. S17 is documented, not fixed. S18 is not fixed.

The evidence for each is in `backend/test/*.test.js`; see TESTING_AND_EVALUATION.md §2.
