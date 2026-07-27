#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FOUNDRY_ROOT="${PROJECT_ROOT}/.tools/foundry"
FOUNDRY_BIN="${FOUNDRY_ROOT}/bin"

if [[ -x "${FOUNDRY_BIN}/forge" && -x "${FOUNDRY_BIN}/anvil" ]]; then
  "${FOUNDRY_BIN}/forge" --version
  exit 0
fi

case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) ASSET_PATTERN='darwin_arm64.tar.gz$' ;;
  Darwin-x86_64) ASSET_PATTERN='darwin_amd64.tar.gz$' ;;
  Linux-aarch64) ASSET_PATTERN='linux_arm64.tar.gz$' ;;
  Linux-x86_64) ASSET_PATTERN='linux_amd64.tar.gz$' ;;
  *)
    echo "Unsupported Foundry platform: $(uname -s)-$(uname -m)" >&2
    exit 1
    ;;
esac

mkdir -p "${FOUNDRY_BIN}"
RELEASE_JSON="$(mktemp)"
ARCHIVE_PATH="$(mktemp)"
trap 'rm -f "${RELEASE_JSON}" "${ARCHIVE_PATH}"' EXIT

curl --fail --silent --show-error --location \
  "https://api.github.com/repos/foundry-rs/foundry/releases/latest" \
  --output "${RELEASE_JSON}"

DOWNLOAD_URL="$(
  jq -r --arg pattern "${ASSET_PATTERN}" \
    '.assets[] | select(.browser_download_url | test($pattern)) | .browser_download_url' \
    "${RELEASE_JSON}" | head -n 1
)"

if [[ -z "${DOWNLOAD_URL}" || "${DOWNLOAD_URL}" == "null" ]]; then
  echo "No matching official Foundry release asset was found." >&2
  exit 1
fi

curl --fail --silent --show-error --location \
  "${DOWNLOAD_URL}" \
  --output "${ARCHIVE_PATH}"

tar -xzf "${ARCHIVE_PATH}" -C "${FOUNDRY_BIN}"
"${FOUNDRY_BIN}/forge" --version
"${FOUNDRY_BIN}/anvil" --version
