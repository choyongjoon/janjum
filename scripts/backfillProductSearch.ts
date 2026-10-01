#!/usr/bin/env tsx

/**
 * One-time migration: build the `productSearch` rows for existing products.
 *
 * Product search reads the slim productSearch table instead of every product
 * document. New writes keep it in sync, but products that existed before the
 * table was added need a row. Until any row exists, search falls back to
 * reading products directly, so run this right after deploying.
 *
 * Idempotent; safe to re-run.
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { logger } from "../shared/logger";

const convexUrl = process.env.VITE_CONVEX_URL;
if (!convexUrl) {
  logger.error("VITE_CONVEX_URL environment variable is required");
  process.exit(1);
}
const client = new ConvexHttpClient(convexUrl);
const UPLOAD_SECRET = process.env.CONVEX_UPLOAD_SECRET;

// Products carry nutrition and descriptions, so keep each page well under the
// per-transaction read limit.
const PAGE_SIZE = 200;

async function main() {
  let cursor: string | null = null;
  let total = 0;

  while (true) {
    // Pages must be fetched in order: each one needs the previous cursor.
    const result: {
      continueCursor: string;
      isDone: boolean;
      processed: number;
    } = await client.mutation(api.productSearch.backfill, {
      paginationOpts: { numItems: PAGE_SIZE, cursor },
      uploadSecret: UPLOAD_SECRET,
    });
    total += result.processed;
    logger.info(`Indexed ${total} products`);

    if (result.isDone) {
      break;
    }
    cursor = result.continueCursor;
  }

  logger.info(`✅ productSearch backfilled for ${total} products.`);
}

main().catch((error) => {
  logger.error("Backfill failed:", error);
  process.exit(1);
});
