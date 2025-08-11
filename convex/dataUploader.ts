import type { GenericDataModel, GenericMutationCtx } from 'convex/server';
import { v } from 'convex/values';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { mutation } from './_generated/server';

interface CrawlerProduct {
  name: string;
  nameEn: string;
  description: string;
  externalCategory: string;
  externalId: string;
  externalImageUrl: string;
  externalUrl: string;
  price: number | null;
  category: string | null;
  imageStorageId?: Id<'_storage'>;
}
interface UploadResults {
  processed: number;
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  removed: number;
  reactivated: number;
  errors: string[];
  processingTime: number;
  removedProducts?: string[];
  reactivatedProducts?: string[];
}

// Helper function to upload products to database
async function uploadProductsToDatabase(
  ctx: GenericMutationCtx<GenericDataModel>,
  products: CrawlerProduct[],
  cafeId: Id<'cafes'>,
  results: UploadResults,
  downloadImages = false
) {
  for (const product of products) {
    try {
      const result = await ctx.runMutation(api.products.upsertProduct, {
        ...product,
        cafeId,
        category: product.category ?? undefined,
        nameEn: product.nameEn ?? undefined,
        description: product.description ?? undefined,
        externalCategory: product.externalCategory ?? undefined,
        externalImageUrl: product.externalImageUrl ?? undefined,
        price: product.price ?? undefined,
        downloadImages,
      });
      if (result.action === 'created') {
        results.created++;
      } else if (result.action === 'updated') {
        results.updated++;
      } else if (result.action === 'unchanged') {
        results.unchanged++;
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
    // Environment-based authentication
    const allowedSecret = process.env.CONVEX_UPLOAD_SECRET;
    if (!allowedSecret || uploadSecret !== allowedSecret) {
      throw new Error('Unauthorized: Invalid upload secret');
    }

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

    // Upload processed products
    await uploadProductsToDatabase(
      ctx,
      products,
      cafe._id,
      results,
      downloadImages
    );

    // After uploading, check for removed products
    const currentExternalIds = products.map((p) => p.externalId);
    const removalResults = await ctx.runMutation(api.products.markAsRemoved, {
      cafeId: cafe._id,
      currentExternalIds,
    });

    // Update results with removal information
    results.removed = removalResults.removed;
    results.reactivated = removalResults.reactivated;
    results.removedProducts = removalResults.removedProducts;
    results.reactivatedProducts = removalResults.reactivatedProducts;

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
