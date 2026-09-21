#!/usr/bin/env tsx

/**
 * One-time migration: move 매머드 익스프레스 products out of the 매머드커피
 * cafe into their own `mammothexpress` cafe.
 *
 * The old Mammoth crawler also collected the Express food menu, so those
 * products live under `mammoth`. Once the crawlers are split, the next
 * `mammoth` upload would soft-remove them and the first `mammothexpress`
 * upload would recreate them as brand-new records (new shortIds, reviews left
 * on the removed rows). Re-parenting the existing records first keeps both.
 *
 * Run after `pnpm add-cafe mammothexpress` and before the first
 * `mammothexpress` upload. Express product ids (menuSeq) never overlap with
 * 매머드커피's, so every Express id found under `mammoth` is moved.
 *
 * Dry run by default. Pass --apply to write.
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

const EXPRESS_LIST_URL = "https://mmthcoffee.com/sub/menu/list_sub.php";
// Every tab of the Express menu (list.html)
const EXPRESS_MENU_TYPES = ["O", "C", "D", "N", "T", "B", "F", "R", "M"];
const MENU_SEQ_REGEX = /goViewB\((\d+)\)/g;

async function fetchExpressMenuSeqs(): Promise<string[]> {
  const pages = await Promise.all(
    EXPRESS_MENU_TYPES.map(async (menuType) => {
      const response = await fetch(`${EXPRESS_LIST_URL}?menuType=${menuType}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for menuType=${menuType}`);
      }
      return response.text();
    })
  );
  const seqs = new Set<string>();
  for (const html of pages) {
    for (const match of html.matchAll(MENU_SEQ_REGEX)) {
      seqs.add(match[1]);
    }
  }
  return [...seqs];
}

async function main() {
  const apply = process.argv.includes("--apply");

  const externalIds = await fetchExpressMenuSeqs();
  logger.info(`매머드 익스프레스 lists ${externalIds.length} products`);

  const result = await client.mutation(api.products.moveProductsToCafe, {
    fromCafeSlug: "mammoth",
    toCafeSlug: "mammothexpress",
    externalIds,
    dryRun: !apply,
    uploadSecret: UPLOAD_SECRET,
  });

  // Ids still on the Express menu but never collected under mammoth are
  // expected: they are simply new to janjum and the first upload adds them
  logger.info(
    `Result: ${JSON.stringify({ ...result, missing: result.missing.length }, null, 2)}`
  );

  if (apply) {
    logger.info("✅ Products moved.");
  } else {
    logger.info("DRY RUN: nothing was written. Re-run with --apply to write.");
  }
}

main().catch((error) => {
  logger.error("Move failed:", error);
  process.exit(1);
});
