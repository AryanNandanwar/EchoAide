# EchoAide

**Secure medical notes & transcription** — EchoAide helps clinicians document patient encounters with live audio transcription and AI-generated structured clinical notes.

Production: [https://app.echoaide.in](https://app.echoaide.in)

## Features

- **Live transcription** — Record consultations in the browser; audio streams over WebSocket to Soniox for real-time speech-to-text.
- **Structured clinical notes** — AWS Bedrock turns transcripts into formatted notes with history, findings, investigations, and medications.
- **Patient intake queue** — Receptionists register patients; doctors see pending intakes on the home page and start recording from there.
- **Patient & note management** — Browse patients, view past notes, and track pending documentation.
- **Role-based access** — Separate flows for doctors and receptionists with JWT authentication.

## Architecture

```
Browser (React SPA)
  │
  ├─ REST /api/* ──────────────► NestJS backend ──► Supabase Postgres
  │
  └─ WebSocket /socket.io ─────► StreamingService
                                   │
                                   ├─ Soniox (live STT)
                                   └─ AWS Bedrock (clinical note generation)
                                        │
                                        └─ SSE push when note is ready
```

| Service | Stack | Role |
|---------|-------|------|
| `frontend/` | React 19, Vite, MUI, Tailwind | SPA served by nginx in production |
| `backend/` | NestJS 11, TypeORM, Socket.IO | REST API, WebSocket streaming, auth, persistence, Bedrock note generation |
| `docker-compose.yml` | Docker | Production stack: backend + nginx + certbot |

All REST routes use the `/api` prefix. WebSocket traffic is at `/socket.io` (excluded from the prefix).

## Prerequisites

- **Node.js** 18+ (for local frontend/backend dev)
- **Docker & Docker Compose** (for full-stack local or production deployment)
- **Supabase Postgres** — connection string via `SUPABASE_DB_URL`
- **Soniox API key** — real-time speech-to-text
- **AWS credentials** — Bedrock access for note generation (Claude 3.5 Sonnet)

## Environment variables

Copy the example files and fill in secrets. Never commit real credentials.

| File | Purpose |
|------|---------|
| `.env` | Shared Docker / root config |
| `backend/.env` | Database, Soniox, AWS Bedrock, JWT |
| `frontend/.env` | Vite build-time API and WebSocket URLs |

**Backend (required):**

- `SUPABASE_DB_URL` — Postgres connection string
- `SONIOX_API_KEY` — speech-to-text
- `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` — Bedrock
- `BEDROCK_MODEL_ID` — e.g. `apac.anthropic.claude-3-5-sonnet-20241022-v2:0`
- `JWT_SECRET` or `APP_JWT_SECRET` — auth tokens
- `FRONTEND_ORIGIN` — CORS origin (defaults to `https://app.echoaide.in`)

**Frontend (build-time):**

- `VITE_REACT_APP_API_BASE_URL` — leave empty in Docker (paths already include `/api`)
- `VITE_REACT_APP_WEBSOCKET_URL` — leave empty in Docker (same-origin via nginx)
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — Supabase client

See `backend/.env.example` and `frontend/.env.example` for the full list.

## Running locally

### Docker (recommended)

Full stack over HTTP, no TLS:

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

Open **http://localhost:8081**

### Split dev servers

Run backend and frontend separately:

```bash
# Terminal 1 — backend (port 3000)
cd backend && npm install && npm run start:dev

# Terminal 2 — frontend (port 5173)
cd frontend && npm install && npm run dev
```

Set `VITE_REACT_APP_API_BASE_URL=http://localhost:3000` in `frontend/.env` for split dev.

### Database migrations

```bash
cd backend && npm run migration:run
```

### Frontend audio smoke test

```bash
cd frontend && npm run test:audio-pipeline
```

## Project structure

```
.
├── backend/          NestJS API, WebSocket gateway, streaming, auth, Bedrock note generation
├── frontend/         React SPA, nginx configs for local and production
├── docker-compose.yml
├── docker-compose.local.yml
└── certbot/          TLS certificates (production only)
```

### Frontend routes

| Route | Description |
|-------|-------------|
| `/` | Home — intake queue and recording |
| `/patients` | Patient list |
| `/notes` | Clinical notes |
| `/pending-notes` | Notes awaiting completion |
| `/login` | Doctor and receptionist login |
| `/receptionist/intake` | Patient registration |

### Backend modules

- **auth** — login, signup, JWT refresh
- **doctor** / **patient** — profiles and patient lists
- **clinical_notes** — note CRUD
- **intake** — receptionist queue
- **websocket** + **streaming** — live recording, Soniox STT, Bedrock note generation
- **sse** — server-sent events when a final note is ready

### Clinical note generation

When a recording stops, `StreamingService` sends the final transcript to `IncrementalNoteService`, which calls AWS Bedrock and returns an 8-section structured note (patient details, history, problem, findings, diagnosis, investigations, instructions, medications).

## Production deployment

Production uses `docker-compose.yml` with nginx on ports 80/443 and certbot for Let's Encrypt renewal.

```bash
docker compose up --build -d
```

The frontend is built into the nginx image with Vite env args from `.env`. nginx proxies `/api/` and `/socket.io` to the backend.

## CI/CD

GitHub Actions workflows live in `.github/workflows/`. See [TESTING.md](TESTING.md) for details on every test layer that CI runs.

### CI — `ci.yml`

Runs on pull requests and pushes to `main`:

| Job | What it runs |
|-----|--------------|
| `backend` | ESLint, `nest build`, Jest unit + API + integration + WebSocket suites (Node 20) |
| `frontend` | ESLint, `vite build`, Vitest, Node test runner suites (Node 22) |
| `e2e` | Playwright browser journeys against the E2E backend and Vite dev server (needs `backend` + `frontend`) |
| `smoke` | `scripts/smoke/run-all.sh` — nginx configs, CORS/Helmet, migrations, Docker compose stack (needs `backend`) |

Optional repository secrets `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are passed to the frontend build (placeholders otherwise).

### CD — `deploy.yml`

Deploys on push to `main` (or manually via *Run workflow*). It SSHes into the production server, resets the checkout to `origin/main`, and re-runs `docker compose up --build -d`. App secrets (`.env`, `backend/.env`) live on the server and are never handled by the workflow.

Required repository secrets:

| Secret | Purpose |
|--------|---------|
| `SSH_HOST` | Production server hostname or IP |
| `SSH_USER` | SSH user |
| `SSH_KEY` | Private key for the SSH user |
| `SSH_PORT` | SSH port (optional, defaults to 22) |
| `DEPLOY_PATH` | Absolute path to the repo checkout on the server |

## Development notes

- Auth tokens are stored in `localStorage` or `sessionStorage` as `ds_token` and `ds_user`.
- On stop recording, the client generates a UUID `noteId` and sends it with `doctorId` and optional `patientId` / `intakeId`.
- An alternate upload path exists at `POST /api/upload-audio` for file-based transcription without live WebSocket.
- `SarvamClientService` is implemented in the backend but not wired; Soniox is the active STT provider.

## License

Private / unlicensed. See individual `package.json` files for details.
