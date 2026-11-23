#! /bin/bash
# sync data to production for every cafe in AVAILABLE_CAFES
# one failing cafe does not stop the rest; exits non-zero if any failed

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

if [ "$#" -gt 0 ]; then
  CAFES=("$@")
else
  # shellcheck disable=SC2207
  CAFES=($(cd "$ROOT_DIR" && pnpm exec tsx -e \
    'import { AVAILABLE_CAFES } from "./shared/constants.ts"; console.log(Object.keys(AVAILABLE_CAFES).join(" "))'))
fi

if [ "${#CAFES[@]}" -eq 0 ]; then
  echo "No cafes to sync"
  exit 1
fi

echo "Syncing ${#CAFES[@]} cafes: ${CAFES[*]}"

# The uploader marks each cafe whose data changed here; purge the CDN page
# cache once at the end instead of after every cafe.
CHANGED_DIR="$ROOT_DIR/actors/crawler/crawler-outputs/changed"
rm -rf "$CHANGED_DIR"
export SKIP_CDN_PURGE=1

FAILED=()

for cafe in "${CAFES[@]}"; do
  echo ""
  echo "=== Syncing $cafe ==="
  if "$SCRIPT_DIR/dataSyncProd.sh" "$cafe"; then
    echo "=== Done: $cafe ==="
  else
    echo "=== Failed: $cafe ==="
    FAILED+=("$cafe")
  fi
done

echo ""
(cd "$ROOT_DIR" && pnpm dotenv -e .env.prod-upload -- "$SCRIPT_DIR/purgeCdnCache.sh" --if-changed "$CHANGED_DIR") ||
  echo "CDN purge failed; pages refresh on the next purge or deploy"

echo ""
if [ "${#FAILED[@]}" -gt 0 ]; then
  echo "Failed cafes (${#FAILED[@]}/${#CAFES[@]}): ${FAILED[*]}"
  exit 1
fi

echo "All ${#CAFES[@]} cafes synced"
