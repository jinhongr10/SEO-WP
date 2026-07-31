#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

PYTHON_BIN="${PYTHON:-}"
if [[ -z "$PYTHON_BIN" ]]; then
  if [[ -x "$PROJECT_ROOT/.venv/bin/python" ]]; then
    PYTHON_BIN="$PROJECT_ROOT/.venv/bin/python"
  else
    PYTHON_BIN="python3"
  fi
fi

BACKEND_ENTRY="$PROJECT_ROOT/backend/desktop_entry.py"
RUNTIME_DIR="$PROJECT_ROOT/desktop/resources/backend"
BUILD_DIR="$PROJECT_ROOT/build/pyinstaller-macos"
SPEC_DIR="$BUILD_DIR/spec"
PYINSTALLER_CONFIG_DIR="${PYINSTALLER_CONFIG_DIR:-$PROJECT_ROOT/build/pyinstaller-cache}"
BACKEND_BUNDLE="$RUNTIME_DIR/seo-wp-sync-backend"
BACKEND_EXE="$BACKEND_BUNDLE/seo-wp-sync-backend"

if [[ ! -f "$BACKEND_ENTRY" ]]; then
  echo "Backend desktop entry was not found: $BACKEND_ENTRY" >&2
  exit 1
fi

"$PYTHON_BIN" -m PyInstaller --version >/dev/null

mkdir -p "$RUNTIME_DIR" "$BUILD_DIR" "$SPEC_DIR" "$PYINSTALLER_CONFIG_DIR"
rm -rf "$BACKEND_BUNDLE"

export PYINSTALLER_CONFIG_DIR

"$PYTHON_BIN" -m PyInstaller \
  --noconfirm \
  --clean \
  --onedir \
  --name seo-wp-sync-backend \
  --distpath "$RUNTIME_DIR" \
  --workpath "$BUILD_DIR" \
  --specpath "$SPEC_DIR" \
  --paths "$PROJECT_ROOT" \
  --collect-submodules backend \
  --collect-data backend \
  --exclude-module backend.tests \
  --exclude-module tests \
  "$BACKEND_ENTRY"

if [[ ! -x "$BACKEND_EXE" ]]; then
  echo "Expected backend executable was not created: $BACKEND_EXE" >&2
  exit 1
fi

chmod 755 "$BACKEND_EXE"
echo "macOS backend executable written to $BACKEND_EXE"
