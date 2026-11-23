#! /bin/bash
# sync data to production
# Purges the CDN page cache afterwards if the upload changed data, unless
# SKIP_CDN_PURGE is set (dataSyncProdAll.sh purges once after every cafe).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
CHANGED_DIR="$ROOT_DIR/actors/crawler/crawler-outputs/changed"

if [ -z "${SKIP_CDN_PURGE:-}" ]; then
  rm -rf "$CHANGED_DIR"
fi

pnpm run crawl "$1" &&
  pnpm run categorize "$1" &&
  pnpm dotenv -e .env.prod-upload -- pnpm run upload "$1"
status=$?

if [ -z "${SKIP_CDN_PURGE:-}" ]; then
  pnpm dotenv -e .env.prod-upload -- "$SCRIPT_DIR/purgeCdnCache.sh" --changed "$CHANGED_DIR"
fi

exit $status
