import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation } from "./_generated/server";
import { verifyUploadSecret } from "./uploadSecret";

const WHITESPACE_REGEX = /\s+/g;

/** Lowercase and drop whitespace so "바닐라 라떼" matches "바닐라라떼". */
export function normalizeSearchText(text: string): string {
  return text.toLowerCase().replace(WHITESPACE_REGEX, "");
}

type SearchedProductFields = Pick<
  Doc<"products">,
  "cafeId" | "category" | "isActive" | "name" | "nameEn"
>;

export type SearchRow = Omit<Doc<"productSearch">, "_creationTime" | "_id">;

export function buildSearchRow(
  productId: Id<"products">,
  product: SearchedProductFields
): SearchRow {
  return {
    productId,
    cafeId: product.cafeId,
    isActive: product.isActive ?? true,
    name: product.name,
    nameKey: normalizeSearchText(product.name),
    nameEnKey: product.nameEn ? normalizeSearchText(product.nameEn) : undefined,
    category: product.category,
  };
}

/**
 * Upsert the productSearch row mirroring `product`. Call after every write
 * that changes a product's name, nameEn, category, cafeId or isActive.
 */
export async function syncProductSearch(
  ctx: MutationCtx,
  productId: Id<"products">,
  product: SearchedProductFields
): Promise<void> {
  const row = buildSearchRow(productId, product);

  const existing = await ctx.db
    .query("productSearch")
    .withIndex("by_product", (q) => q.eq("productId", productId))
    .first();

  if (existing) {
    await ctx.db.replace(existing._id, row);
  } else {
    await ctx.db.insert("productSearch", row);
  }
}

export async function removeProductSearch(
  ctx: MutationCtx,
  productId: Id<"products">
): Promise<void> {
  const rows = await ctx.db
    .query("productSearch")
    .withIndex("by_product", (q) => q.eq("productId", productId))
    .collect();
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

/**
 * Build the productSearch rows for existing products, one page at a time.
 * Run `pnpm backfill-product-search` after deploying the productSearch table.
 * Idempotent.
 */
export const backfill = mutation({
  args: {
    paginationOpts: paginationOptsValidator,
    uploadSecret: v.optional(v.string()),
  },
  handler: async (ctx, { paginationOpts, uploadSecret }) => {
    verifyUploadSecret(uploadSecret);

    const page = await ctx.db.query("products").paginate(paginationOpts);
    for (const product of page.page) {
      await syncProductSearch(ctx, product._id, product);
    }

    return {
      processed: page.page.length,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});
