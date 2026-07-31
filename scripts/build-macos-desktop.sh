#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

ARCH="${ARCH:-arm64}"
SKIP_BACKEND="${SKIP_BACKEND:-false}"
SKIP_NODE_RUNTIME="${SKIP_NODE_RUNTIME:-false}"
CSC_IDENTITY_AUTO_DISCOVERY="${CSC_IDENTITY_AUTO_DISCOVERY:-false}"
ELECTRON_BUILDER_CONFIG="${ELECTRON_BUILDER_CONFIG:-electron-builder.json}"
PUBLISH="${PUBLISH:-never}"

cd "$PROJECT_ROOT"

npm run build

if [[ "$SKIP_BACKEND" != "true" ]]; then
  BACKEND_CACHE_STATUS="$(node scripts/desktop-build-cache.mjs status backend --platform mac)"
  if [[ "${FORCE_BACKEND:-false}" == "true" || "$BACKEND_CACHE_STATUS" != "reuse" ]]; then
    npm run build:desktop:backend:mac
    node scripts/desktop-build-cache.mjs mark backend --platform mac >/dev/null
  else
    echo "Reusing cached macOS backend executable (set FORCE_BACKEND=true to rebuild)."
  fi
fi

if [[ "$SKIP_NODE_RUNTIME" != "true" ]]; then
  NODE_CACHE_STATUS="$(node scripts/desktop-build-cache.mjs status node-runtime --platform mac)"
  if [[ "${FORCE_NODE_RUNTIME:-false}" == "true" || "$NODE_CACHE_STATUS" != "reuse" ]]; then
    npm run prepare:desktop:node-runtime
    node scripts/desktop-build-cache.mjs mark node-runtime --platform mac >/dev/null
  else
    echo "Reusing cached macOS Node runtime (set FORCE_NODE_RUNTIME=true to rebuild)."
  fi
fi

export CSC_IDENTITY_AUTO_DISCOVERY
npx electron-builder --mac dmg zip "--$ARCH" --config "$ELECTRON_BUILDER_CONFIG" --publish "$PUBLISH"
