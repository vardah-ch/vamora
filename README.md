# VAMORA — Virtual Alzheimer's Memory & Observation Recall Assistant

VAMORA is a web application that helps people living with Alzheimer's-type memory difficulties, their family caregivers and their doctors. It holds personal memories (photos, voice notes, people, places, events and daily routines) and care observations. A companion, *Cara*, answers questions **only from the person's own saved memories** and says when it does not know.

> **Not a medical device.** VAMORA does not diagnose, treat or monitor any condition and has not been clinically evaluated. All evaluation data in this repository is synthetic.

Originally developed by **Vardah Ahmad** and **Amna Khan** as a Computer Science Final Year Project at the University of Gujrat, Pakistan. The `research-hardening` branch adds the security, privacy, AI and research work described in [`docs/`](docs). The original state is preserved at tag `pre-research-baseline`.

## Features
| Area | What it does |
|---|---|
| **Patient** | Large-card home screen; My Photos with voice notes; **Memory Book** (people, places, events, routines); **Talk with Cara** by typing or voice, with the memories each answer is based on; mood check-in; an optional mood camera that only *guesses* and never saves without confirmation; **My Privacy** (choose who sees what, stop sharing, see who looked) |
| **Caregiver** | Request to join a care team (the patient approves); see only what was shared; add memories; write care notes (append-only, author can withdraw); non-diagnostic observation summaries |
| **Doctor** | Assigned patients only; appointments, medications, MMSE as score bands and trend; add caregivers to the care team (no photo access by default); record consent mode or representative |
| **Administrator** | Create, lock and deactivate accounts; assign doctors; review the access audit log. **No access to patient content** |

## Architecture (short)
- React 19 + Vite frontend.
- Express 5 + Sequelize + PostgreSQL backend.
- A local embedding model (transformers.js, free, offline after first download).
- An optional Groq LLM (Llama 3.3 70B). Without an API key, Cara runs in retrieval-only mode.

Details: [ARCHITECTURE.md](docs/ARCHITECTURE.md) · [AI_METHODOLOGY.md](docs/AI_METHODOLOGY.md) · [PRIVACY_AND_SECURITY.md](docs/PRIVACY_AND_SECURITY.md)

## Quick start

**Requirements:** Node.js 20+ (tested on 24) and PostgreSQL 14+ (tested on 16).

```bash
# 1. Backend
cd backend
cp .env.example .env        # set DB_* and generate JWT secrets (command in the file)
npm install
npx sequelize-cli db:create # or create the database yourself
npm run db:migrate          # non-destructive; safe on an existing VAMORA database
npm run db:seed             # optional demo data (synthetic) – run once on an empty DB
npm run dev                 # http://localhost:5000/health

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

**Demo accounts** (from the seeders; development only, change or remove before any real use):

| Role | Email | Password |
|---|---|---|
| Patient | sarah.patient@vamora.com | password123 |
| Caregiver | amna.caregiver@vamora.com | password123 |
| Doctor | sarah.md@vamora.com | password123 |
| Super-admin | admin@vamora.hospital | Admin@Vamora2026! |

**Upgrading an existing installation:** back up the database first, then run `npm run db:migrate`.

- Existing caregiver relationships become active sharing arrangements marked *needs review*, so the patient is asked to confirm them.
- Doctors keep the patients they created, or whose caregivers they linked. Other patients must be assigned through the super-admin "assignments" endpoint.
- Photos uploaded earlier keep working through the new secure media endpoint.

## Tests and evaluation
```bash
cd backend
npm test                      # 72 integration tests on a real, throw-away PostgreSQL (no setup needed)
npm run eval:retrieval        # retrieval evaluation on the synthetic dev set
node eval/runRetrievalEval.js --data eval/data/persona_yusuf_heldout.json
GROQ_API_KEY=... npm run eval:companion   # end-to-end comparison with the original prompt
```

See [TESTING_AND_EVALUATION.md](docs/TESTING_AND_EVALUATION.md). Key held-out result: retrieval MRR@5 is 0.833, against 0.018 for the original design (synthetic data; see the caveats there).

## Documentation
| Document | Contents |
|---|---|
| [docs/AUDIT.md](docs/AUDIT.md) | Phase-1 audit of the original code (bugs, vulnerabilities, gaps) |
| [docs/ROADMAP.md](docs/ROADMAP.md) | What is done, what remains, how to resume |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System, data model, full API reference, configuration, HCI decisions |
| [docs/AI_METHODOLOGY.md](docs/AI_METHODOLOGY.md) | Retrieval, grounding, safety, mood camera; measured results |
| [docs/PRIVACY_AND_SECURITY.md](docs/PRIVACY_AND_SECURITY.md) | Threat model, permissions, consent modes, audit, security controls |
| [docs/TESTING_AND_EVALUATION.md](docs/TESTING_AND_EVALUATION.md) | Executed tests and proposed studies |
| [docs/LITERATURE_REVIEW.md](docs/LITERATURE_REVIEW.md) | Verified literature, matrix, research gaps |
| [docs/RESEARCH_PROPOSAL.md](docs/RESEARCH_PROPOSAL.md) | Research questions, hypotheses, methodology |
| [docs/RESEARCH_LIMITATIONS.md](docs/RESEARCH_LIMITATIONS.md) | What cannot be claimed |
| [docs/CONTRIBUTIONS.md](docs/CONTRIBUTIONS.md) | Contributions, honest assessment, portfolio summary |

Older setup notes (`HOW_TO_RUN.md`, `BACKEND_SETUP_GUIDE.md`) describe the original version and are superseded by this file.

## License
MIT (as declared in `backend/package.json`).
