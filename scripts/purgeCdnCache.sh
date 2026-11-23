#! /bin/bash
# Invalidate long-cached pages on Vercel's CDN (cache tags set in
# src/server/cachePolicy.ts), so the site shows newly synced menu data.
#
# Usage:
#   scripts/purgeCdnCache.sh --changed <dir>   purge the cafes named by the
#       marker files in <dir> (the uploader writes one per cafe whose data
#       changed) plus the pages that mix cafes; does nothing if <dir> is empty
#   scripts/purgeCdnCache.sh --all              purge every long-cached page
#
# Needs VERCEL_TOKEN and VERCEL_PROJECT_ID (and VERCEL_TEAM_ID for a team
# project). Without them it warns and exits 0, so a sync never fails over it.
#
# "Invalidate" marks pages stale: the next visitor still gets the cached copy
# while the CDN refreshes it in the background, so a purge causes no stampede.

set -euo pipefail

ALL_PAGES_TAG="pages"
CROSS_CAFE_TAG="cross-cafe"
CAFE_TAG_PREFIX="cafe-"
# Vercel accepts at most 16 tags per invalidation request.
MAX_TAGS_PER_REQUEST=16

TAGS=()
case "${1:-}" in
  --changed)
    CHANGED_DIR="${2:?--changed needs a directory}"
    if [ -z "$(ls -A "$CHANGED_DIR" 2>/dev/null)" ]; then
      echo "No menu data changed; keeping the CDN cache"
      exit 0
    fi
    for marker in "$CHANGED_DIR"/*; do
      TAGS+=("${CAFE_TAG_PREFIX}$(basename "$marker")")
    done
    TAGS+=("$CROSS_CAFE_TAG")
    echo "Menu data changed for: $(ls "$CHANGED_DIR" | tr '\n' ' ')"
    ;;
  --all)
    TAGS=("$ALL_PAGES_TAG")
    ;;
  *)
    echo "Usage: $0 --changed <dir> | --all"
    exit 1
    ;;
esac

if [ -z "${VERCEL_TOKEN:-}" ] || [ -z "${VERCEL_PROJECT_ID:-}" ]; then
  echo "::warning::VERCEL_TOKEN or VERCEL_PROJECT_ID is not set; skipping the CDN purge. Pages refresh within 30 days or on the next deploy."
  exit 0
fi

query="projectIdOrName=${VERCEL_PROJECT_ID}"
if [ -n "${VERCEL_TEAM_ID:-}" ]; then
  query="${query}&teamId=${VERCEL_TEAM_ID}"
fi

response_file=$(mktemp)
trap 'rm -f "$response_file"' EXIT

for ((start = 0; start < ${#TAGS[@]}; start += MAX_TAGS_PER_REQUEST)); do
  batch=("${TAGS[@]:start:MAX_TAGS_PER_REQUEST}")
  tags_json=$(printf '"%s",' "${batch[@]}")
  tags_json="[${tags_json%,}]"

  status=$(curl --silent --show-error --output "$response_file" \
    --write-out '%{http_code}' \
    --request POST "https://api.vercel.com/v1/edge-cache/invalidate-by-tags?${query}" \
    --header "Authorization: Bearer ${VERCEL_TOKEN}" \
    --header "Content-Type: application/json" \
    --data "{\"tags\":${tags_json},\"target\":\"production\"}")

  if [ "$status" != "200" ]; then
    echo "CDN purge failed with HTTP $status:"
    cat "$response_file"
    echo ""
    exit 1
  fi
  echo "Invalidated CDN cache tags: ${batch[*]}"
done
