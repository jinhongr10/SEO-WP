#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [ ! -f ".env" ]; then
  echo "Missing .env in $(pwd)"
  echo "Create .env first, then run: bash start-ubuntu.sh"
  exit 1
fi

has_env_key() {
  grep -Eq "^$1=" .env
}

env_value() {
  awk -F= -v key="$1" '
    $1 == key {
      value=$0
      sub(/^[^=]*=/, "", value)
      gsub(/^"/, "", value)
      gsub(/"$/, "", value)
      gsub(/^'\''/, "", value)
      gsub(/'\''$/, "", value)
      print value
      exit
    }
  ' .env
}

has_any_env_key() {
  for key in "$@"; do
    if has_env_key "$key"; then
      return 0
    fi
  done
  return 1
}

missing=()
has_any_env_key WP_BASE_URL WP_URL || missing+=("WP_BASE_URL or WP_URL")
has_env_key WP_USER || missing+=("WP_USER")
has_any_env_key WP_APP_PASSWORD WP_APP_PASS || missing+=("WP_APP_PASSWORD or WP_APP_PASS")
has_env_key WC_CONSUMER_KEY || missing+=("WC_CONSUMER_KEY")
has_env_key WC_CONSUMER_SECRET || missing+=("WC_CONSUMER_SECRET")

if [ "${#missing[@]}" -gt 0 ]; then
  echo ".env is missing required WordPress/WooCommerce settings:"
  printf '  - %s\n' "${missing[@]}"
  exit 1
fi

VERTEX_JSON_PATH="${VERTEX_SA_JSON:-$(env_value VERTEX_SA_JSON)}"
VERTEX_JSON_PATH="${VERTEX_JSON_PATH:-./vertex-sa.json}"

if [ ! -f "$VERTEX_JSON_PATH" ]; then
  echo "Missing Vertex service-account JSON: $VERTEX_JSON_PATH"
  echo "Put vertex-sa.json in this directory or set VERTEX_SA_JSON=/absolute/path/vertex-sa.json in .env."
  exit 1
fi

if docker ps -a --format '{{.Names}}' | grep -qx 'seo-wp-sync'; then
  echo "Removing existing seo-wp-sync container so docker compose can own it..."
  docker rm -f seo-wp-sync >/dev/null
fi

docker compose --env-file .env -f docker-compose.ubuntu.yml up -d

APP_PORT_VALUE="${APP_PORT:-$(env_value APP_PORT)}"
APP_PORT_VALUE="${APP_PORT_VALUE:-3000}"

echo
echo "Started seo-wp-sync."
echo "Open: http://$(hostname -I | awk '{print $1}'):$APP_PORT_VALUE"
echo
echo "Check injected env:"
echo "  docker exec seo-wp-sync sh -lc 'env | grep -E \"^(WP_|WC_|GOOGLE_|http_proxy|https_proxy|HTTP_PROXY|HTTPS_PROXY|DB_PATH)\"'"
echo
echo "Run a product scan test:"
echo "  docker exec seo-wp-sync sh -lc 'cd /app && node --import tsx src/cli.ts product-scan'"
