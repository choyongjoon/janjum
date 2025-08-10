#! /bin/bash
# sync data to production

pnpm run crawl "$1"
pnpm run categorize "$1"
dotenv -e .env.prod-upload -- pnpm run upload "$1" --download-images
