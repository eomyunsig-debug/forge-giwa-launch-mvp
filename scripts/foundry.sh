#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_FORGE="${PROJECT_ROOT}/.tools/foundry/bin/forge"

if [[ -x "${LOCAL_FORGE}" ]]; then
  FORGE_BIN="${LOCAL_FORGE}"
elif command -v forge >/dev/null 2>&1; then
  FORGE_BIN="$(command -v forge)"
else
  echo "Foundry is missing. Run scripts/bootstrap-foundry.sh first." >&2
  exit 1
fi

cd "${PROJECT_ROOT}/packages/contracts"
exec "${FORGE_BIN}" "$@"
