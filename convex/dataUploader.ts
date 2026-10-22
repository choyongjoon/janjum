import { v } from "convex/values";
import type { Nutritions } from "../shared/nutritions";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation } from "./_generated/server";
import {
  buildRevivalIndex,
  findRevivalCandidate,
  type RevivalIndex,
  removeFromRevivalIndex,
} from "./productMatching";
import { hasProductChanges, softRemoveMissingProducts } from "./products";
import { verifyUploadSecret } from "./uploadSecret";

interface CrawlerProduct {
  category: string | null;
  description: string;
  externalCategory: string;
  externalId: string;
  externalImageUrl: string;
  externalUrl: string;
  imageStorageId?: Id<"_storage">;
  name: string;
  nameEn: string;
  nutritions?: Nutritions | null;
  price: number | null;
}
interface UploadResults {
  created: number;
  errors: string[];
  processed: number;
  processingTime: number;
  reactivated: number;
  reactivatedProducts?: string[];
  removed: number;
  removedProducts?: string[];
  skipped: number;
  unchanged: number;
  updated: number;
}

// Helper function to clean nutrition data (convert null to undefined)
function cleanNutritions(
  nutritions?: Nutritions | null
): Nutritions | undefined {
  if (!nutritions) {
    return;
  }

  const cleaned: Nutritions = {};

  // Convert all null values to undefined
  for (const [key, value] of Object.entries(nutritions)) {
    if (value !== null) {
      (cleaned as Record<string, unknown>)[key] = value;
    }
  }

  // Return undefined if no actual nutrition data exists
  const hasData = Object.keys(cleaned).length > 0;
  return hasData ? cleaned : undefined;
}

interface CafeSnapshot {
  activeProducts: Doc<"products">[];
  // First product per externalId, matching what upsertProduct's
  // `by_cafe_external_id(...).first()` lookup would return.
  byExternalId: Map<string, Doc<"products">>;
  // External categories the cafe already has products in, active or removed.
  knownCategories: Set<string>;
  revivalIndex: RevivalIndex<Id<"products">>;
}

// Read the cafe's products once for the whole upload and derive everything the
// upload needs from that single scan. Every sub-mutation below shares this
// transaction's read budget, and database I/O is billed per document read, so
// the upload used to cost ~4 full scans of the cafe's menu per run (categories,
// removed products, one lookup per product, and the removal pass).
async function loadCafeSnapshot(
  ctx: MutationCtx,
  cafeId: Id<"cafes">
): Promise<CafeSnapshot> {
  const activeProducts: Doc<"products">[] = [];
  const removedProducts: Doc<"products">[] = [];
  const byExternalId = new Map<string, Doc<"products">>();
  const knownCategories = new Set<string>();

  for await (const product of ctx.db
    .query("products")
    .withIndex("by_cafe", (q) => q.eq("cafeId", cafeId))) {
    // Same split as the by_cafe_active index lookups this replaces: products
    // with no isActive flag are neither removable nor revivable.
    if (product.isActive === true) {
      activeProducts.push(product);
    } else if (product.isActive === false) {
      removedProducts.push(product);
    }
    if (!byExternalId.has(product.externalId)) {
      byExternalId.set(product.externalId, product);
    }
    if (product.externalCategory) {
      knownCategories.add(product.externalCategory);
    }
  }

  return {
    activeProducts,
    byExternalId,
    knownCategories,
    revivalIndex: buildRevivalIndex(removedProducts),
  };
}

// A product created in a category the cafe never had before is an existing
// menu item that the crawler now covers (e.g. a bakery tab added to the
// crawl), not a new launch. Date it to the cafe's creation so it stays out of
// the new-products list, like the cafe's first import.
function getAddedAtIfCreated(
  product: CrawlerProduct,
  knownCategories: Set<string>,
  cafeCreationTime: number
): number | undefined {
  const isNewCategory =
    knownCategories.size > 0 &&
    Boolean(product.externalCategory) &&
    !knownCategories.has(product.externalCategory);
  return isNewCategory ? Math.floor(cafeCreationTime) : undefined;
}

// Crawler output (nulls for missing values) to upsertProduct's arguments.
function toUpsertArgs(
  product: CrawlerProduct,
  cafeId: Id<"cafes">,
  downloadImages: boolean
) {
  return {
    ...product,
    cafeId,
    category: product.category ?? undefined,
    nameEn: product.nameEn ?? undefined,
    description: product.description ?? undefined,
    externalCategory: product.externalCategory ?? undefined,
    externalImageUrl: product.externalImageUrl ?? undefined,
    price: product.price ?? undefined,
    nutritions: cleanNutritions(product.nutritions),
    downloadImages,
  };
}

// Helper function to upload products to database
async function uploadProductsToDatabase(
  ctx: MutationCtx,
  products: CrawlerProduct[],
  cafe: { _id: Id<"cafes">; _creationTime: number },
  snapshot: CafeSnapshot,
  results: UploadResults,
  downloadImages = false
) {
  const cafeId = cafe._id;
  const { byExternalId, knownCategories, revivalIndex } = snapshot;

  for (const product of products) {
    try {
      const args = toUpsertArgs(product, cafeId, downloadImages);

      // Most of a daily crawl is unchanged. Compare against the snapshot here
      // instead of running a sub-mutation that re-reads the product only to
      // decide there is nothing to write.
      const existing = byExternalId.get(product.externalId);
      if (existing && !hasProductChanges(existing, args)) {
        results.unchanged++;
        continue;
      }
      // The snapshot copy is stale once written; let any later duplicate of
      // this externalId go through upsertProduct's own lookup.
      byExternalId.delete(product.externalId);

      const result = await ctx.runMutation(internal.products.upsertProduct, {
        ...args,
        revivableProductId: findRevivalCandidate(revivalIndex, product.name),
        addedAtIfCreated: getAddedAtIfCreated(
          product,
          knownCategories,
          cafe._creationTime
        ),
      });
      if (result.action === "created") {
        results.created++;
      } else if (result.action === "updated") {
        results.updated++;
      } else if (result.action === "unchanged") {
        results.unchanged++;
      }

      // Reactivation is reported by the upsert itself -- that patch is what
      // brings a soft-removed product back -- not by the later markAsRemoved.
      if (result.reactivated) {
        removeFromRevivalIndex(revivalIndex, result.id);
        results.reactivated++;
        results.reactivatedProducts?.push(result.name ?? product.name);
      }
    } catch (error) {
      results.errors.push(`Failed to upsert ${product.name}: ${error}`);
    }
  }
}

export const uploadProductsFromJson = mutation({
  args: {
    products: v.array(v.any()),
    cafeSlug: v.string(),
    dryRun: v.optional(v.boolean()),
    downloadImages: v.optional(v.boolean()),
    uploadSecret: v.string(),
  },
  handler: async (
    ctx,
    { products, cafeSlug, dryRun = false, downloadImages = false, uploadSecret }
  ) => {
    verifyUploadSecret(uploadSecret);

    const startTime = Date.now();

    // Find or create cafe
    const cafe = await ctx.runQuery(api.cafes.getBySlug, {
      slug: cafeSlug,
    });

    if (!cafe) {
      throw new Error(`Cafe not found: ${cafeSlug}`);
    }

    const results: UploadResults = {
      processed: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      errors: [],
      skipped: 0,
      removed: 0,
      reactivated: 0,
      reactivatedProducts: [],
      processingTime: 0,
    };

    if (dryRun) {
      results.processingTime = Date.now() - startTime;
      return {
        ...results,
        message: `Dry run completed. Would process ${products.length} products.`,
        samples: products.slice(0, 3), // Show first 3 as samples
      };
    }

    const snapshot = await loadCafeSnapshot(ctx, cafe._id);

    // Upload processed products
    await uploadProductsToDatabase(
      ctx,
      products,
      cafe,
      snapshot,
      results,
      downloadImages
    );

    // After uploading, soft-remove active products the crawl no longer lists.
    // Upserts only touch crawled externalIds (or revive removed products), so
    // the snapshot's active list is still accurate for everything else.
    const removalResults = await softRemoveMissingProducts(
      ctx,
      snapshot.activeProducts,
      new Set(products.map((p) => p.externalId))
    );

    // Update results with removal information. `reactivated` is already
    // accumulated by uploadProductsToDatabase above.
    results.removed = removalResults.removed;
    results.removedProducts = removalResults.removedProducts;

    results.processingTime = Date.now() - startTime;

    let message = `Upload completed in ${results.processingTime}ms. Created: ${results.created}, Updated: ${results.updated}, Unchanged: ${results.unchanged}`;

    if (results.removed > 0) {
      message += `, Removed: ${results.removed}`;
    }

    if (results.reactivated > 0) {
      message += `, Reactivated: ${results.reactivated}`;
    }

    return {
      ...results,
      message,
    };
  },
});
