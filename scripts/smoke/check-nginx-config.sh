#!/usr/bin/env bash
# Validate nginx config files. Uses `docker run nginx:alpine nginx -t` when Docker
# is available; otherwise falls back to structural checks (same as Jest smoke test).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SSL_CERT_DIR="${TMPDIR:-/tmp}/echoaide-nginx-smoke-certs"

ensure_dummy_ssl_certs() {
  mkdir -p "${SSL_CERT_DIR}"
  if [[ ! -f "${SSL_CERT_DIR}/privkey.pem" || ! -f "${SSL_CERT_DIR}/fullchain.pem" ]]; then
    openssl req -x509 -nodes -newkey rsa:2048 \
      -keyout "${SSL_CERT_DIR}/privkey.pem" \
      -out "${SSL_CERT_DIR}/fullchain.pem" \
      -days 1 -subj /CN=app.echoaide.in >/dev/null 2>&1
  fi
}

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
    # --add-host: nginx -t resolves upstream hostnames; "backend" only exists
    # on the compose network, not in this isolated container.
    local volumes=(-v "${absolute_config}:/etc/nginx/conf.d/default.conf:ro")
    if [[ "${config_path}" == *nginx-ssl.conf ]]; then
      # Dummy certs: nginx-ssl.conf references Let's Encrypt paths absent here.
      ensure_dummy_ssl_certs
      volumes+=(-v "${SSL_CERT_DIR}:/etc/letsencrypt/live/app.echoaide.in:ro")
    fi
    docker run --rm \
      --add-host=backend:127.0.0.1 \
      "${volumes[@]}" \
      nginx:alpine nginx -t
  else
    assert_structure "${config_path}"
  fi
}

test_config "frontend/nginx-local.conf"
test_config "frontend/nginx.conf"
test_config "frontend/nginx-ssl.conf"

echo "nginx config smoke checks passed."
