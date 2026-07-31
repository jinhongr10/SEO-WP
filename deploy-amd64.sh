#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

IMAGE_TAR="${IMAGE_TAR:-seo-wp-sync-amd64.tar}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.server.yml}"
ENV_FILE="${ENV_FILE:-.env}"

if [ ! -f "$IMAGE_TAR" ]; then
  echo "Missing image tar: $IMAGE_TAR"
  exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Missing compose file: $COMPOSE_FILE"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE"
  echo "Create it first: cp .env.server.example .env"
  exit 1
fi

has_env_key() {
  grep -Eq "^[[:space:]]*$1=" "$ENV_FILE"
}

has_any_env_key() {
  for key in "$@"; do
    if has_env_key "$key"; then
      return 0
    fi
  done
  return 1
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
  ' "$ENV_FILE"
}

is_truthy() {
  case "$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

missing=()
has_any_env_key WP_BASE_URL WP_URL || missing+=("WP_BASE_URL or WP_URL")
has_env_key WP_USER || missing+=("WP_USER")
has_any_env_key WP_APP_PASSWORD WP_APP_PASS WP_JWT || missing+=("WP_APP_PASSWORD, WP_APP_PASS, or WP_JWT")
has_env_key WC_CONSUMER_KEY || missing+=("WC_CONSUMER_KEY")
has_env_key WC_CONSUMER_SECRET || missing+=("WC_CONSUMER_SECRET")

if [ "${#missing[@]}" -gt 0 ]; then
  echo "$ENV_FILE is missing required settings:"
  printf '  - %s\n' "${missing[@]}"
  exit 1
fi

mkdir -p keys

llm_provider="$(env_value LLM_PROVIDER)"
use_vertex="$(env_value GOOGLE_GENAI_USE_VERTEXAI)"
gemini_key="$(env_value GEMINI_API_KEY)"
vertex_json="${VERTEX_SA_JSON:-$(env_value VERTEX_SA_JSON)}"
vertex_json="${vertex_json:-./keys/vertex-sa.json}"

if [ "$llm_provider" != "none" ] && { is_truthy "$use_vertex" || [ -z "$gemini_key" ]; }; then
  if [ ! -f "$vertex_json" ]; then
    echo "Missing Vertex service-account JSON: $vertex_json"
    echo "Put it at ./keys/vertex-sa.json or set VERTEX_SA_JSON=/absolute/path/vertex-sa.json in $ENV_FILE."
    exit 1
  fi
  has_any_env_key GOOGLE_CLOUD_PROJECT GOOGLE_PROJECT_ID || {
    echo "$ENV_FILE is missing GOOGLE_CLOUD_PROJECT or GOOGLE_PROJECT_ID for Vertex AI."
    exit 1
  }
fi

if docker compose version >/dev/null 2>&1; then
  compose_cmd=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  compose_cmd=(docker-compose)
else
  echo "Docker Compose is not installed."
  exit 1
fi

echo "Loading Docker image from $IMAGE_TAR..."
docker load -i "$IMAGE_TAR"

if docker ps -a --format '{{.Names}}' | grep -qx 'seo-wp-sync'; then
  echo "Removing existing seo-wp-sync container..."
  docker rm -f seo-wp-sync >/dev/null
fi

echo "Starting seo-wp-sync..."
"${compose_cmd[@]}" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d

app_port="${APP_PORT:-$(env_value APP_PORT)}"
app_port="${app_port:-3000}"

echo
echo "seo-wp-sync is running."
echo "Open: http://SERVER_IP:$app_port"
echo
echo "Status:"
echo "  ${compose_cmd[*]} -f $COMPOSE_FILE ps"
echo
echo "Logs:"
echo "  ${compose_cmd[*]} -f $COMPOSE_FILE logs -f --tail=100"
