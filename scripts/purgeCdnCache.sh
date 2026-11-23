#! /bin/bash
# Invalidate every long-cached page on Vercel's CDN (the "pages" cache tag set
# in src/server/cachePolicy.ts), so the site shows newly synced menu data.
#
# Usage: scripts/purgeCdnCache.sh [--if-changed <dir>]
#   --if-changed <dir>  only purge when <dir> holds a marker file, which the
#                       uploader writes for each cafe whose data changed
#
# Needs VERCEL_TOKEN and VERCEL_PROJECT_ID (and VERCEL_TEAM_ID for a team
# project). Without them it warns and exits 0, so a sync never fails over it.
#
# "Invalidate" marks pages stale: the next visitor still gets the cached copy
# while the CDN refreshes it in the background, so a purge causes no stampede.

set -euo pipefail

CACHE_TAG="pages"

if [ "${1:-}" = "--if-changed" ]; then
  CHANGED_DIR="${2:?--if-changed needs a directory}"
  if [ -z "$(ls -A "$CHANGED_DIR" 2>/dev/null)" ]; then
    echo "No menu data changed; keeping the CDN cache"
    exit 0
  fi
  echo "Menu data changed for: $(ls "$CHANGED_DIR" | tr '\n' ' ')"
fi

if [ -z "${VERCEL_TOKEN:-}" ] || [ -z "${VERCEL_PROJECT_ID:-}" ]; then
  echo "::warning::VERCEL_TOKEN or VERCEL_PROJECT_ID is not set; skipping the CDN purge. Pages refresh within 30 days or on the next deploy."
  exit 0
fi

query="projectIdOrName=${VERCEL_PROJECT_ID}"
if [ -n "${VERCEL_TEAM_ID:-}" ]; then
  query="${query}&teamId=${VERCEL_TEAM_ID}"
fi

status=$(curl --silent --show-error --output /tmp/purge-response.json \
  --write-out '%{http_code}' \
  --request POST "https://api.vercel.com/v1/edge-cache/invalidate-by-tags?${query}" \
  --header "Authorization: Bearer ${VERCEL_TOKEN}" \
  --header "Content-Type: application/json" \
  --data "{\"tags\":[\"${CACHE_TAG}\"],\"target\":\"production\"}")

if [ "$status" != "200" ]; then
  echo "CDN purge failed with HTTP $status:"
  cat /tmp/purge-response.json
  echo ""
  exit 1
fi

echo "Invalidated the \"${CACHE_TAG}\" CDN cache tag"
