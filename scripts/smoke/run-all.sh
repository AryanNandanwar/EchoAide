#!/usr/bin/env bash
# Infrastructure & deployment smoke tests (CI-friendly).
#
# Covers:
#   - nginx config syntax (nginx -t)
#   - TypeORM migrations on empty Postgres baseline
#   - docker-compose stack: backend, SPA, /api/ proxy, /socket.io polling
#   - CORS / Helmet policy from main.ts
#
# Requirements: docker, docker compose, node/npm (backend deps installed).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "${ROOT}"

COMPOSE=(docker compose -f docker-compose.smoke.yml)
SMOKE_DB_URL="${SMOKE_DB_URL:-postgres://smoke:smoke@127.0.0.1:5433/echoaide_smoke}"
SMOKE_BASE_URL="${SMOKE_BASE_URL:-http://127.0.0.1:8082}"
export SMOKE_DB_URL DATABASE_SSL=false SMOKE_ORIGIN=http://localhost:8082

cleanup() {
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> Jest: nginx config smoke"
(
  cd backend
  npm run test:smoke -- --testPathPatterns=nginx-config
)

echo "==> Jest: CORS / Helmet smoke"
(
  cd backend
  npm run test:smoke -- --testPathPatterns=cors-helmet
)

echo "==> Start Postgres for migration + compose checks"
"${COMPOSE[@]}" up postgres -d --wait

echo "==> Jest: TypeORM migration smoke"
(
  cd backend
  REQUIRE_MIGRATION_SMOKE=1 SMOKE_DB_URL="${SMOKE_DB_URL}" DATABASE_SSL=false \
    npm run test:smoke -- --testPathPatterns=migrations
)

echo "==> Build and start backend + nginx"
"${COMPOSE[@]}" up backend nginx -d --wait

echo "==> Shell: compose stack curl smoke"
bash scripts/smoke/check-compose-stack.sh "${SMOKE_BASE_URL}"

echo ""
echo "All infrastructure smoke tests passed."
