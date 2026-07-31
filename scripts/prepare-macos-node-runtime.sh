#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

NODE_EXE="${1:-${NODE_EXE:-}}"
if [[ -z "$NODE_EXE" ]]; then
  if ! command -v node >/dev/null 2>&1; then
    echo "node was not found on PATH. Install Node.js on the macOS build machine first." >&2
    exit 1
  fi
  NODE_EXE="$(node -p 'process.execPath')"
fi

if [[ ! -f "$NODE_EXE" ]]; then
  echo "Node executable was not found: $NODE_EXE" >&2
  exit 1
fi

RUNTIME_DIR="$PROJECT_ROOT/desktop/resources/node-runtime/bin"
RUNTIME_NODE="$RUNTIME_DIR/node"

mkdir -p "$RUNTIME_DIR"
cp "$NODE_EXE" "$RUNTIME_NODE"
chmod 755 "$RUNTIME_NODE"

(
  cd "$PROJECT_ROOT"
  node scripts/prepare-desktop-node-modules.mjs
)

echo "macOS Node runtime written to $RUNTIME_NODE"
