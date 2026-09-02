#!/usr/bin/env tsx

/**
 * One-time repair: give Mega's products their real `addedAt` dates back.
 *
 * When the Mega crawler's `externalId` scheme changed (#67) to tell HOT and ICE
 * variants apart, 155 of 225 products got new ids, so they were recreated with
 * `addedAt: now` and the old rows were soft-removed. That put 157 Mega items
 * into the 30-day new-products list (63% of it), and
 * `backdateReimportedProducts` cleared the flood by stamping them all with the
 * cafe creation time -- correct for the symptom, but it threw away the real
 * dates.
 *
 * Those dates were never actually lost: `markAsRemoved` soft-removes, so each
 * old row still holds its original `addedAt` under the *old* id
 * (`mega_${name}`). This script reads them back and reapplies them.
 *
 * A HOT/ICE pair both inherit the single old record's date, which is right --
 * they were one product before the split, so both variants date from when that
 * product first appeared.
 *
 * Dry run by default. Pass --apply to write.
 */

import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { logger } from "../shared/logger";

const convexUrl = process.env.VITE_CONVEX_URL;
if (!convexUrl) {
  logger.error("VITE_CONVEX_URL environment variable is required");
  process.exit(1);
}
const client = new ConvexHttpClient(convexUrl);
const UPLOAD_SECRET = process.env.CONVEX_UPLOAD_SECRET;

const CAFE_SLUG = "mega";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const LOOKUP_CONCURRENCY = 8;

/**
 * Two products kept their id through the migration (they carry no HOT/ICE
 * badge), so there is no soft-removed twin to read a date from -- the backdate
 * overwrote the only copy. These values were captured from production before
 * that write, and are the genuine 2026-08-27 arrival dates.
 */
const CAPTURED_BEFORE_BACKDATE: Record<string, number> = {
  j973xq3r5b7v7ygytvmd3h60ds8d9pwz: 1_787_800_993_333, // 중식마녀 마라크림 새우토스트
  j97340bvqvhbzawpnjc4wky3xx8d9sfp: 1_787_800_993_333, // 메가MGC커피 자일리톨 커피 캔디
};

interface PlannedUpdate {
  addedAt: number;
  from: number;
  name: string;
  productId: Id<"products">;
  source: string;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    results.push(...(await Promise.all(batch.map(fn))));
  }
  return results;
}

async function buildPlan(): Promise<PlannedUpdate[]> {
  const cafe = await client.query(api.cafes.getBySlug, { slug: CAFE_SLUG });
  if (!cafe) {
    throw new Error(`Cafe not found: ${CAFE_SLUG}`);
  }

  const active = await client.query(api.products.getByCafe, {
    cafeId: cafe._id,
  });

  // The backdate stamped its batch with the cafe creation time; those are the
  // records whose dates need restoring. Anything else kept a real date.
  const backdated = active.filter(
    (product) => Math.abs(product.addedAt - cafe._creationTime) < ONE_DAY_MS
  );
  logger.info(
    `${active.length} active products, ${backdated.length} carry the backdate stamp`
  );

  const names = [...new Set(backdated.map((product) => product.name))];
  const originals = new Map<string, number>();

  const found = await mapWithConcurrency(names, LOOKUP_CONCURRENCY, (name) =>
    client
      .query(api.products.getByExternalId, {
        cafeSlug: CAFE_SLUG,
        externalId: `mega_${name}`,
      })
      .then((original) => ({ name, original }))
  );

  for (const { name, original } of found) {
    // Only a soft-removed row is a pre-migration original; an active row under
    // the old id is the product itself, which the backdate already overwrote.
    if (original && original.isActive === false) {
      originals.set(name, original.addedAt);
    }
  }

  const plan: PlannedUpdate[] = [];
  const unresolved: string[] = [];

  for (const product of backdated) {
    const fromOriginal = originals.get(product.name);
    const captured = CAPTURED_BEFORE_BACKDATE[product._id];
    const addedAt = fromOriginal ?? captured;

    if (addedAt === undefined) {
      unresolved.push(product.name);
      continue;
    }

    plan.push({
      productId: product._id,
      addedAt,
      from: product.addedAt,
      name: product.name,
      source: fromOriginal ? "soft-removed original" : "captured pre-backdate",
    });
  }

  if (unresolved.length > 0) {
    logger.warn(
      `No original date found for ${unresolved.length} product(s); they will be left as-is:`
    );
    for (const name of unresolved) {
      logger.warn(`  ${name}`);
    }
  }

  return plan;
}

async function main() {
  const apply = process.argv.includes("--apply");

  const plan = await buildPlan();
  if (plan.length === 0) {
    logger.info("Nothing to restore.");
    return;
  }

  const byMonth = new Map<string, number>();
  for (const update of plan) {
    const month = new Date(update.addedAt).toISOString().slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
  }

  logger.info(`Restoring ${plan.length} product(s):`);
  for (const month of [...byMonth.keys()].sort()) {
    logger.info(`  ${month}  ${byMonth.get(month)}`);
  }

  const thirtyDaysAgo = Date.now() - 30 * ONE_DAY_MS;
  const returning = plan.filter((update) => update.addedAt >= thirtyDaysAgo);
  logger.info(
    `${returning.length} product(s) will re-enter the 30-day new-products window:`
  );
  for (const update of returning) {
    logger.info(
      `  ${new Date(update.addedAt).toISOString().slice(0, 10)}  ${update.name}`
    );
  }

  const result = await client.mutation(api.products.restoreAddedAt, {
    updates: plan.map(({ productId, addedAt }) => ({ productId, addedAt })),
    dryRun: !apply,
    uploadSecret: UPLOAD_SECRET,
  });

  logger.info(`Result: ${JSON.stringify(result, null, 2)}`);

  if (apply) {
    logger.info("✅ Dates restored.");
  } else {
    logger.info("DRY RUN: nothing was written. Re-run with --apply to write.");
  }
}

main().catch((error) => {
  logger.error("Restore failed:", error);
  process.exit(1);
});
