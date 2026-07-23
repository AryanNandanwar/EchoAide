#!/usr/bin/env bash
# Curl-based smoke checks against the docker-compose.smoke.yml stack.
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:8082}"
ORIGIN="${SMOKE_ORIGIN:-http://localhost:8082}"

echo "==> SPA index served by nginx at ${BASE_URL}/"
curl -fsS "${BASE_URL}/" | grep -Eiq '<html|<!doctype html'

echo "==> /api/ proxied to backend"
api_status="$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST "${BASE_URL}/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{}')"
if [[ "${api_status}" != "400" && "${api_status}" != "401" ]]; then
  echo "Expected 400/401 from /api/auth/login, got ${api_status}" >&2
  exit 1
fi

echo "==> /socket.io/ polling upgrade path"
socket_body="$(curl -fsS "${BASE_URL}/socket.io/?EIO=4&transport=polling")"
if [[ "${socket_body}" != 0* ]]; then
  echo "Unexpected socket.io polling body: ${socket_body}" >&2
  exit 1
fi

echo "==> CORS preflight through nginx proxy"
cors_headers="$(curl -sS -D - -o /dev/null \
  -X OPTIONS "${BASE_URL}/api/auth/login" \
  -H "Origin: ${ORIGIN}" \
  -H 'Access-Control-Request-Method: POST')"
echo "${cors_headers}" | grep -Eiq 'access-control-allow-origin:.*'"${ORIGIN}"

echo "Compose stack smoke checks passed (${BASE_URL})."
