# Testing Guide

EchoAide uses a layered test strategy: fast unit tests near the code, HTTP and WebSocket integration tests against an in-memory SQLite backend, browser E2E journeys with Playwright, and infrastructure smoke tests for Docker/nginx/migrations/CORS.

## Quick reference

| Layer | Tool | Location | Command |
|-------|------|----------|---------|
| Backend unit | Jest | `backend/src/**/*.spec.ts` | `cd backend && npm test` |
| Backend API | Jest + Supertest | `backend/test/api/` | `cd backend && npm run test:api` |
| Backend integration | Jest | `backend/test/integration/` | `cd backend && npm run test:integration` |
| Backend WebSocket | Jest + Socket.IO client | `backend/test/websocket/` | `cd backend && npm run test:websocket` |
| Backend smoke | Jest + shell + Docker | `backend/test/smoke/`, `scripts/smoke/` | `cd backend && npm run test:smoke` or `bash scripts/smoke/run-all.sh` |
| Frontend component/hook | Vitest + RTL | `frontend/src/**/*.spec.{ts,tsx}` | `cd frontend && npm test` |
| Frontend utilities (legacy) | Node test runner | `frontend/src/**/*.test.ts` | `cd frontend && npm run test:node` |
| Browser E2E | Playwright | `e2e/tests/` | `cd e2e && npm test` |

---

## Backend

### Unit tests (`npm test`)

Jest runs all `*.spec.ts` files under `backend/src/`. These are pure or lightly mocked tests for services, utilities, and schemas.

| Area | File(s) | What is covered |
|------|---------|-----------------|
| Soniox client | `streaming/soniox-client.service.spec.ts` | WebSocket URL construction, config mapping, translation options, **external-service contract** (mock Soniox WS server) |
| Bedrock / incremental notes | `streaming/incremental-note.service.spec.ts` | Retry/backoff, prompt assembly, **Bedrock adapter contract** |
| Streaming sessions | `streaming/streaming.service.spec.ts` | Session lifecycle, pause/resume |
| Streaming pause | `streaming/streaming-pause.integration.spec.ts` | Pause behaviour at service level |
| Parsed note schema | `streaming/schemas/parsed-note.schema.spec.ts` | Zod validation of LLM output |
| PDF generation | `clinical_notes/pdf.service.spec.ts` | HTML → PDF pipeline (Puppeteer mocked; optional real Chromium with `RUN_PDF_E2E=true`) |
| Patient details | `clinical_notes/patient-details.util.spec.ts` | Note header formatting |
| Phone utils | `utils/phone.utils.spec.ts` | Normalisation / validation |

**Counts:** 8 suites, ~45 tests (1 PDF test skipped unless `RUN_PDF_E2E=true`).

### API controller tests (`npm run test:api`)

Supertest hits the Nest HTTP layer with **SQLite in-memory** via `test/utils/test-database.module.ts`. Each suite resets the DB between tests.

| File | Endpoints / behaviour |
|------|----------------------|
| `test/api/auth.api.spec.ts` | Signup, login, refresh, logout, receptionist creation |
| `test/api/patient.api.spec.ts` | Doctor patient CRUD, search, assignment |
| `test/api/clinical-notes.api.spec.ts` | Note listing, status, PDF download |
| `test/api/intake.api.spec.ts` | Receptionist intake flow |
| `test/api/upload-audio.api.spec.ts` | Audio upload endpoint |

**Counts:** 31 tests across 5 suites.

### Integration tests (`npm run test:integration`)

Exercises multi-step flows through real Nest modules (still SQLite, mocked Soniox/Bedrock/PDF where needed).

| File | Flow |
|------|------|
| `auth.integration.spec.ts` | Signup → login → JWT usage |
| `patient.integration.spec.ts` | Patient creation and doctor scoping |
| `clinical-notes.integration.spec.ts` | Note creation and retrieval |
| `intake.integration.spec.ts` | Receptionist intake → patient record |
| `streaming.integration.spec.ts` | Streaming session + transcription path |
| `incremental-note.integration.spec.ts` | Incremental LLM note updates |

**Counts:** 34 tests across 6 suites. Run with `--runInBand` (configured in `jest-integration.json`).

### WebSocket integration tests (`npm run test:websocket`)

| File | What is covered |
|------|-----------------|
| `test/websocket/streaming-websocket.integration.spec.ts` | Socket.IO connect, `start-recording` / `audio-chunk` / `stop-recording`, session cleanup, error paths (mock Soniox WS server in `test/utils/mock-soniox-ws-server.ts`) |

**Counts:** 11 tests. Uses `--forceExit` because Socket.IO servers can leave open handles.

### Infrastructure smoke tests (`npm run test:smoke`)

Validates deployment concerns without exercising full business logic.

| File | What is covered |
|------|-----------------|
| `test/smoke/cors-helmet.smoke.spec.ts` | Helmet security headers; allowed vs blocked CORS origins (same policy as `main.ts` via `src/config/cors.config.ts`) |
| `test/smoke/migrations.smoke.spec.ts` | Baseline SQL → `npm run migration:run` → assert `patients.weight` and `refresh_tokens` schema |
| `test/smoke/nginx-config.smoke.spec.ts` | `nginx -t` in Docker when available; structural checks for `nginx-local.conf`, `nginx.conf`, `nginx-ssl.conf` |

**Environment variables:**

| Variable | Purpose |
|----------|---------|
| `SMOKE_DB_URL` | Postgres URL for migration smoke (default: `postgres://smoke:smoke@127.0.0.1:5433/echoaide_smoke`) |
| `DATABASE_SSL=false` | Required for local/smoke Postgres (no Supabase SSL) |
| `REQUIRE_MIGRATION_SMOKE=1` | Fail instead of skip when Postgres is unreachable (used by `run-all.sh`) |
| `SKIP_MIGRATION_SMOKE=1` | Always skip migration tests |

Migration tests **skip with a warning** when Postgres is not running. The full smoke runner expects Postgres via Docker.

### E2E backend server (Playwright support)

Not a Jest suite — a dedicated Nest server used by Playwright:

| Path | Role |
|------|------|
| `backend/test/e2e/playwright-server.ts` | Entrypoint (`npm run start:e2e`) |
| `backend/test/e2e/create-e2e-app.ts` | SQLite app with mocked Soniox, Bedrock, PDF |
| `backend/test/e2e/e2e.controller.ts` | `GET /api/e2e/health`, `POST /api/e2e/reset`, `POST /api/e2e/simulate-recording` |
| `backend/test/e2e/seed.ts` | Seeded doctor and receptionist accounts |

Enabled only when `E2E_MODE=true`.

---

## Frontend

### Component & hook tests — Vitest (`npm test`)

Vitest with **jsdom**, **React Testing Library**, and setup in `frontend/src/test/setup.ts`. Tests match `src/**/*.spec.{ts,tsx}`.

| Area | File(s) |
|------|---------|
| Pages | `Login`, `home`, `Patients`, `Notes`, `PendingNotes`, `ReceptionistIntake` |
| Components | `ClinicalNoteViewer`, `transcribeBar`, `PendingClinicalNotePanel` |
| Hooks | `use-require-auth`, `use-clinical-note-subscription`, `use-streaming-transcription` |
| Context | `pending-clinical-note-context` (Supabase/API polling path) |

Shared helpers: `frontend/src/test/test-utils.tsx`.

**Counts:** 13 files, 33 tests.

### Utility tests — Node test runner (`npm run test:node`)

Older `*.test.ts` files run with Node’s built-in test runner:

- `lib/auth.test.ts`, `lib/websocket-url.test.ts`
- `services/supabase-service.test.ts`, `services/websocket-service.test.ts`
- `utils/clinical-note-flow.test.ts`, `clinical-note-record.test.ts`, `recording-status.test.ts`, `audio-pcm.test.ts`
- `context/pending-clinical-note-context.test.ts`

**Requires Node 22+** for `--experimental-strip-types`. On Node 21, use the Vitest suite instead.

### Audio pipeline smoke (`npm run test:audio-pipeline`)

Optional manual smoke script: `frontend/scripts/audio-pipeline-smoke.mjs`.

---

## Browser E2E (Playwright)

Location: `e2e/`. Playwright starts the E2E backend and Vite dev server automatically (`e2e/playwright.config.ts`).

### Journeys

| Spec | Journey |
|------|---------|
| `doctor-recording.spec.ts` | Doctor login → home → **simulated recording** API → pending note panel |
| `doctor-recording-upload.spec.ts` | Live WebSocket audio upload (**skipped** unless `E2E_FULL_WS=1`) |
| `receptionist-intake.spec.ts` | Receptionist login → intake form → patient created |
| `assign-patient-note.spec.ts` | Assign patient to clinical note |
| `pdf-download.spec.ts` | Download clinical note PDF |
| `token-refresh.spec.ts` | Access token refresh flow |

### E2E test accounts

| Role | Email | Password |
|------|-------|----------|
| Doctor | `e2e-doctor@test.local` | `E2eDoctor123!` |
| Receptionist | `e2e-receptionist@test.local` | `E2eReceptionist123!` |

### Running E2E

```bash
cd e2e
npm install
npm test
```

**WSL / Linux:** if Playwright’s bundled Chromium is missing, set:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser npm test
```

**Port conflicts:** default ports are backend **3099**, frontend **5173**. To force a fresh stack:

```bash
fuser -k 3099/tcp 5173/tcp 2>/dev/null || true
PW_REUSE_FRESH=1 npm test
```

**Optional WebSocket upload test:**

```bash
E2E_FULL_WS=1 npm test
```

### E2E frontend mode

When `VITE_E2E_USE_API=true` (set by Playwright config):

- API calls go through Vite proxy to the E2E backend instead of Supabase Realtime.
- Polling delays are zeroed in E2E mode.
- Deep-link hook: `/?e2eNote=<id>&e2ePatientName=...` opens the pending note panel without live recording.

---

## Infrastructure & deployment smoke

Shell scripts and Docker Compose validate the production-like stack.

### Files

| Path | Purpose |
|------|---------|
| `docker-compose.smoke.yml` | Postgres (host port **5433**) + backend + nginx (host port **8082**) |
| `scripts/smoke/run-all.sh` | Full CI flow: Jest smoke → Postgres → migrations → compose up → curl checks |
| `scripts/smoke/check-nginx-config.sh` | Standalone nginx validation |
| `scripts/smoke/check-compose-stack.sh` | curl checks against running stack |

### What `run-all.sh` verifies

1. **nginx configs** — syntax (`nginx -t`) or structural proxy/SPA rules
2. **CORS / Helmet** — Jest smoke (same as backend unit smoke)
3. **Migrations** — TypeORM against empty baseline DB
4. **docker-compose stack:**
   - nginx serves SPA (`/` returns HTML)
   - `/api/` proxies to backend (e.g. `POST /api/auth/login` → 400/401)
   - `/socket.io/?EIO=4&transport=polling` returns Socket.IO handshake
   - CORS preflight through nginx for allowed origin

### Running infrastructure smoke

**Jest only (no Docker required for CORS/nginx structure tests):**

```bash
cd backend && npm run test:smoke
```

**Full stack (requires Docker):**

```bash
bash scripts/smoke/run-all.sh
```

**Local production-like stack (separate from smoke compose):**

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
# App at http://localhost:8081
```

---

## Suggested CI order

Run fast, isolated suites first; slower or Docker-dependent suites last.

```bash
# 1. Backend unit + API + integration + WebSocket
cd backend
npm test
npm run test:api
npm run test:integration
npm run test:websocket

# 2. Frontend Vitest
cd ../frontend
npm test

# 3. Playwright E2E (install browsers in CI: npx playwright install chromium)
cd ../e2e
npm test

# 4. Infrastructure smoke (Docker required)
cd ..
bash scripts/smoke/run-all.sh
```

---

## Test infrastructure notes

### Backend SQLite test DB

`backend/test/utils/test-database.module.ts` provides an in-memory SQLite `DataSource` shared by API, integration, and WebSocket tests. External services (Soniox, Bedrock, Puppeteer) are mocked in test helpers.

### Postgres SSL

Production uses Supabase with SSL. Local and smoke Postgres set `DATABASE_SSL=false` (see `backend/src/config/database-ssl.ts`).

### CORS configuration

Single source of truth: `backend/src/config/cors.config.ts`, used by `main.ts` and CORS smoke tests. Allowed origins include `FRONTEND_ORIGIN`, localhost dev ports, and production domains.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| E2E port already in use | `fuser -k 3099/tcp 5173/tcp` then `PW_REUSE_FRESH=1 npm test` in `e2e/` |
| Playwright Chromium not found (WSL) | `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser` |
| Migration smoke skipped | Start Postgres: `docker compose -f docker-compose.smoke.yml up postgres -d --wait`, or set `SMOKE_DB_URL` |
| `npm run test:node` fails on Node 21 | Use Node 22+ or run `npm test` (Vitest) instead |
| Jest WebSocket hang | Already uses `--forceExit` in `test:websocket` and `test:smoke` scripts |
| Full smoke needs Docker | Enable Docker Desktop WSL integration, then `bash scripts/smoke/run-all.sh` |
