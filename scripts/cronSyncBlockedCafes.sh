#!/bin/bash
# Sync cafes that are blocked on GitHub Actions CI
# Used by Render cron job

set -e

BLOCKED_CAFES=("compose" "twosome")

for cafe in "${BLOCKED_CAFES[@]}"; do
  echo "=== Syncing $cafe ==="
  pnpm run crawl "$cafe"
  pnpm run categorize "$cafe"
  pnpm run upload "$cafe"
  echo "=== Done: $cafe ==="
done
