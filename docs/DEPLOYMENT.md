# Deploying VAMORA (public demo)

The frontend and the API are deployed as **two Vercel projects** from the same repository.

| Project | Root directory | What it serves |
|---|---|---|
| `vamora` (existing) | `frontend` | The React app, e.g. https://vamora-coral.vercel.app |
| `vamora-api` (new) | `backend` | The Express API as one serverless function (`backend/api/index.js`, routed by `backend/vercel.json`) |

The database is a hosted PostgreSQL, for example Neon, added from **Vercel → Storage → Create Database → Neon**. Connect it to `vamora-api`, which then receives `DATABASE_URL`.

## API project environment variables
| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | set by the Neon integration |
| `JWT_SECRET`, `JWT_REFRESH_SECRET`, `MEDIA_URL_SECRET` | three different random strings, at least 32 characters each (`node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`) |
| `CORS_ORIGIN` | `https://vamora-coral.vercel.app` |
| `TRUST_PROXY` | `true` |
| `MEDIA_STORE` | `db`, so photos and voice notes are stored in PostgreSQL, because the serverless disk is temporary |
| `UPLOAD_PATH` | `/tmp/vamora-uploads` |
| `MAX_FILE_SIZE` | `4000000`, because Vercel limits request bodies to about 4.5 MB |
| `EMBEDDINGS` | `off`. The local embedding model is too large for a serverless function, so retrieval uses the lexical and context signals only. Dense retrieval needs a regular server. |
| `SUPER_ADMIN_PASSWORD` | a private password. Without it the development default would be public. |
| `GROQ_API_KEY` | optional. Without it, Cara answers in retrieval-only mode. |

## Build behaviour
`npm run vercel-build` runs `sequelize db:migrate && sequelize db:seed:all`.

- Migrations are additive and safe to run again.
- In production, seeders are recorded in the `SequelizeData` table, so each runs once. The demo data, which is fictional, is inserted only on the first deploy.

This build was rehearsed locally on an empty database, run twice: no duplicate data, and the default admin password was rejected once `SUPER_ADMIN_PASSWORD` was set.

## Frontend project environment variables
| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://<vamora-api domain>/api/v1` |
| `VITE_DEMO_MODE` | `true` shows the demo accounts on the sign-in page. Use this only while the database holds fictional data. |

Redeploy the frontend after changing these, because Vite builds them into the bundle.

## Before any real patient data
A public demo is **not** suitable for real patient information. Real use needs:
- ethics approval;
- a data-protection review;
- a database region and provider chosen for the applicable law;
- backups;
- removal of the demo accounts.

See [PRIVACY_AND_SECURITY.md](PRIVACY_AND_SECURITY.md).
