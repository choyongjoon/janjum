#!/bin/bash
# Sync cafes that are blocked on GitHub Actions CI
# Used by Render cron job
# Note: twosome blocks all cloud IPs (including Render), must be synced manually

set -e

BLOCKED_CAFES=("compose")

for cafe in "${BLOCKED_CAFES[@]}"; do
  echo "=== Syncing $cafe ==="
  pnpm run crawl "$cafe"
  pnpm run categorize "$cafe"
  pnpm run upload "$cafe"
  echo "=== Done: $cafe ==="
done
