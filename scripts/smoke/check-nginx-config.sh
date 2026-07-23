#!/usr/bin/env bash
# Validate nginx config files. Uses `docker run nginx:alpine nginx -t` when Docker
# is available; otherwise falls back to structural checks (same as Jest smoke test).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

assert_proxy_routes() {
  local config="$1"
  grep -Eq 'location[[:space:]]+/api/' "${config}"
  grep -Eq 'proxy_pass[[:space:]]+http://backend:3000' "${config}"
  grep -Eq 'proxy_http_version[[:space:]]+1\.1' "${config}"
}

assert_structure() {
  local config_path="$1"
  local config="${ROOT}/${config_path}"
  echo "==> structural check ${config_path}"
  assert_proxy_routes "${config}"

  case "${config_path}" in
    *nginx-local.conf)
      grep -Eq 'location[[:space:]]+/socket\.io/' "${config}"
      grep -Eq 'try_files[[:space:]]+\$uri[[:space:]]+\$uri/[[:space:]]+/index\.html' "${config}"
      grep -Eq 'Upgrade \$http_upgrade' "${config}"
      ;;
    *nginx-ssl.conf)
      grep -Eq 'location[[:space:]]+/socket\.io/' "${config}"
      grep -Eq 'try_files[[:space:]]+\$uri[[:space:]]+\$uri/[[:space:]]+/index\.html' "${config}"
      grep -Eq 'listen[[:space:]]+443[[:space:]]+ssl' "${config}"
      ;;
    *nginx.conf)
      grep -Eq 'return[[:space:]]+301[[:space:]]+https://' "${config}"
      ;;
  esac
}

test_config() {
  local config_path="$1"
  local absolute_config="${ROOT}/${config_path}"

  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    echo "==> nginx -t ${config_path} (docker)"
    docker run --rm \
      -v "${absolute_config}:/etc/nginx/conf.d/default.conf:ro" \
      nginx:alpine nginx -t
  else
    assert_structure "${config_path}"
  fi
}

test_config "frontend/nginx-local.conf"
test_config "frontend/nginx.conf"
test_config "frontend/nginx-ssl.conf"

echo "nginx config smoke checks passed."
