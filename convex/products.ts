import { v } from 'convex/values';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { type MutationCtx, mutation, query } from './_generated/server';

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('products').collect();
  },
});

export const getByCafe = query({
  args: { cafeId: v.id('cafes') },
  handler: async (ctx, { cafeId }) => {
    return await ctx.db
      .query('products')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .collect();
  },
});

export const search = query({
  args: {
    searchTerm: v.optional(v.string()),
    cafeId: v.optional(v.id('cafes')),
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { searchTerm, cafeId, category, limit = 50 }) => {
    // Return empty array if no search criteria provided
    if (!(searchTerm?.trim() || cafeId || category)) {
      return [];
    }

    const productsQuery = ctx.db.query('products');

    // Filter by active products only
    let products = await productsQuery.collect();

    // Filter by cafe if specified
    if (cafeId) {
      products = products.filter((p) => p.cafeId === cafeId);
    }

    // Filter by category if specified
    if (category) {
      products = products.filter(
        (p) => p.category?.toLowerCase() === category.toLowerCase()
      );
    }

    // Filter by search term if specified
    if (searchTerm?.trim()) {
      const term = searchTerm.toLowerCase();
      products = products.filter((p) => p.name.toLowerCase().includes(term));
    }

    // Get cafe information for each product
    const productWithCafes = await Promise.all(
      products.map(async (product) => {
        const cafe = await ctx.db.get(product.cafeId);
        return {
          ...product,
          cafeName: cafe?.name || '',
        };
      })
    );

    // Sort by name and limit results
    return productWithCafes
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit);
  },
});

export const getCategories = query({
  args: { cafeId: v.optional(v.id('cafes')) },
  handler: async (ctx, { cafeId }) => {
    const productsQuery = ctx.db.query('products');

    let products = await productsQuery.collect();

    // Filter by active products only
    products = products.filter((p) => p.isActive);

    // Filter by cafe if specified
    if (cafeId) {
      products = products.filter((p) => p.cafeId === cafeId);
    }

    // Extract unique categories
    const categories = new Set<string>();
    for (const p of products) {
      if (p.category) {
        categories.add(p.category);
      }
    }

    const availableCategories = Array.from(categories);

    // Sort categories using predefined order
    const categoryOrder = [
      '커피',
      '차',
      '블렌디드',
      '스무디',
      '주스',
      '에이드',
      '그 외',
    ];

    return categoryOrder.filter((category) =>
      availableCategories.includes(category)
    );
  },
});

export const getProductSuggestions = query({
  args: {
    searchTerm: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { searchTerm, limit = 10 }) => {
    if (!searchTerm.trim()) {
      return [];
    }

    const products = await ctx.db.query('products').collect();
    const term = searchTerm.toLowerCase();

    // Filter active products and search in name/nameEn
    const matches = products
      .filter((p) => p.isActive)
      .filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.nameEn?.toLowerCase().includes(term)
      )
      .map((p) => ({
        id: p._id,
        name: p.name,
        nameEn: p.nameEn,
        shortId: p.shortId,
      }))
      .slice(0, limit);

    return matches;
  },
});

type UpsertProductArgs = {
  cafeId: Id<'cafes'>;
  name: string;
  nameEn?: string;
  category?: string;
  description?: string;
  externalImageUrl?: string;
  imageStorageId?: Id<'_storage'>;
  externalId: string;
  externalUrl: string;
  price?: number;
  downloadImages?: boolean;
  isActive?: boolean;
};

type ExistingProduct = {
  _id: Id<'products'>;
  name: string;
  category?: string;
  price?: number;
  description?: string;
  externalImageUrl?: string;
  imageStorageId?: Id<'_storage'>;
  isActive?: boolean;
  removedAt?: number;
};

function hasProductChanges(
  existing: ExistingProduct,
  args: UpsertProductArgs
): boolean {
  return (
    existing.name !== args.name ||
    existing.category !== args.category ||
    existing.price !== args.price ||
    existing.description !== args.description ||
    existing.externalImageUrl !== args.externalImageUrl ||
    existing.imageStorageId !== args.imageStorageId ||
    (existing.isActive ?? true) !== (args.isActive ?? true)
  );
}

function scheduleImageDownloadIfNeeded(
  ctx: MutationCtx,
  args: UpsertProductArgs,
  productId: Id<'products'>,
  shouldDownload: boolean
): void {
  if (shouldDownload && args.downloadImages && args.externalImageUrl) {
    ctx.scheduler.runAfter(0, api.imageDownloader.downloadAndStoreImageAction, {
      imageUrl: args.externalImageUrl,
      productId,
    });
  }
}

async function handleExistingProduct(
  ctx: MutationCtx,
  args: UpsertProductArgs,
  existing: ExistingProduct,
  now: number
): Promise<{ action: string; id: string }> {
  const hasChanges = hasProductChanges(existing, args);

  if (hasChanges) {
    const updateData = {
      ...args,
      updatedAt: now,
      isActive: args.isActive ?? true,
      removedAt:
        (args.isActive ?? true) ? undefined : (existing.removedAt ?? now),
    };
    // Remove downloadImages flag from stored data
    const { downloadImages: _downloadImages, ...dataToStore } = updateData;

    await ctx.db.patch(existing._id, dataToStore);

    const shouldDownloadImage = !existing.imageStorageId;
    scheduleImageDownloadIfNeeded(ctx, args, existing._id, shouldDownloadImage);

    return { action: 'updated', id: existing._id };
  }

  return { action: 'unchanged', id: existing._id };
}

async function createNewProduct(
  ctx: MutationCtx,
  args: UpsertProductArgs,
  now: number
): Promise<{ action: string; id: string }> {
  const shortId: string = await ctx.runMutation(
    api.shortId.generateShortId,
    {}
  );

  const insertData = {
    ...args,
    addedAt: now,
    updatedAt: now,
    isActive: args.isActive ?? true,
    shortId,
  };
  // Remove downloadImages flag from stored data
  const { downloadImages: _downloadImages, ...dataToStore } = insertData;

  const id = await ctx.db.insert('products', dataToStore);

  scheduleImageDownloadIfNeeded(ctx, args, id, true);

  return { action: 'created', id };
}

export const upsertProduct = mutation({
  args: {
    cafeId: v.id('cafes'),
    name: v.string(),
    nameEn: v.optional(v.string()),
    category: v.optional(v.string()),
    externalCategory: v.optional(v.string()),
    description: v.optional(v.string()),
    externalImageUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id('_storage')),
    externalId: v.string(),
    externalUrl: v.string(),
    price: v.optional(v.number()),
    downloadImages: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()), // Default to true if not specified
  },
  handler: async (ctx, args): Promise<{ action: string; id: string }> => {
    const now = Date.now();

    const existing = await ctx.db
      .query('products')
      .withIndex('by_external_id', (q) => q.eq('externalId', args.externalId))
      .first();

    if (existing) {
      return await handleExistingProduct(ctx, args, existing, now);
    }

    return await createNewProduct(ctx, args, now);
  },
});

export const bulkUpsertProducts = mutation({
  args: {
    products: v.array(
      v.object({
        cafeId: v.id('cafes'),
        name: v.string(),
        nameEn: v.optional(v.string()),
        category: v.string(),
        externalCategory: v.optional(v.string()),
        description: v.optional(v.string()),
        externalImageUrl: v.optional(v.string()),
        imageStorageId: v.optional(v.id('_storage')),
        externalId: v.string(),
        externalUrl: v.string(),
        price: v.optional(v.number()),
        downloadImages: v.optional(v.boolean()),
      })
    ),
  },
  handler: async (ctx, { products }) => {
    const results = {
      created: 0,
      updated: 0,
      unchanged: 0,
      errors: [] as string[],
    };

    for (const product of products) {
      try {
        const result = await ctx.runMutation(
          api.products.upsertProduct,
          product
        );
        if (result.action === 'created') {
          results.created++;
        } else if (result.action === 'updated') {
          results.updated++;
        } else if (result.action === 'unchanged') {
          results.unchanged++;
        }
      } catch (error) {
        results.errors.push(`Failed to process ${product.name}: ${error}`);
      }
    }

    return results;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

export const uploadImage = mutation({
  args: {
    productId: v.id('products'),
    storageId: v.id('_storage'),
  },
  handler: async (ctx, { productId, storageId }) => {
    const now = Date.now();

    await ctx.db.patch(productId, {
      imageStorageId: storageId,
      updatedAt: now,
    });

    return { success: true, storageId };
  },
});

export const getImageUrl = query({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, { storageId }) => {
    return await ctx.storage.getUrl(storageId);
  },
});

export const getProductWithImage = query({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const product = await ctx.db.get(productId);
    if (!product) {
      return null;
    }

    let imageUrl: string | null = null;
    if (product.imageStorageId) {
      imageUrl = await ctx.storage.getUrl(product.imageStorageId);
    }

    return {
      ...product,
      imageUrl,
    };
  },
});

export const getByShortId = query({
  args: { shortId: v.string() },
  handler: async (ctx, { shortId }) => {
    return await ctx.db
      .query('products')
      .withIndex('by_short_id', (q) => q.eq('shortId', shortId))
      .first();
  },
});

export const getProductWithImageByShortId = query({
  args: { shortId: v.string() },
  handler: async (ctx, { shortId }) => {
    // First try to find by shortId
    const product = await ctx.db
      .query('products')
      .withIndex('by_short_id', (q) => q.eq('shortId', shortId))
      .first();

    if (!product) {
      return null;
    }

    let imageUrl: string | null = null;
    if (product.imageStorageId) {
      imageUrl = await ctx.storage.getUrl(product.imageStorageId);
    }

    return {
      ...product,
      imageUrl,
    };
  },
});

export const updateProductImage = mutation({
  args: {
    productId: v.id('products'),
    storageId: v.id('_storage'),
  },
  handler: async (ctx, { productId, storageId }) => {
    const now = Date.now();

    await ctx.db.patch(productId, {
      imageStorageId: storageId,
      updatedAt: now,
    });

    return { success: true };
  },
});

export const listWithImageStatus = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 10 }) => {
    const products = await ctx.db.query('products').order('desc').take(limit);

    return products.map((product) => ({
      _id: product._id,
      name: product.name,
      externalImageUrl: product.externalImageUrl,
      imageStorageId: product.imageStorageId,
      hasStorageId: !!product.imageStorageId,
      hasExternalUrl: !!product.externalImageUrl,
    }));
  },
});

export const updateCategory = mutation({
  args: {
    productId: v.string(),
    category: v.string(),
  },
  handler: async (ctx, { productId, category }) => {
    const now = Date.now();

    await ctx.db.patch(productId as Id<'products'>, {
      category,
      updatedAt: now,
    });

    return { success: true, productId, category };
  },
});

export const markProductsAsRemoved = mutation({
  args: {
    cafeId: v.id('cafes'),
    currentExternalIds: v.array(v.string()),
  },
  handler: async (ctx, { cafeId, currentExternalIds }) => {
    const now = Date.now();

    // Get all active products for this cafe
    const allProducts = await ctx.db
      .query('products')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .filter((q) => q.eq(q.field('isActive'), true))
      .collect();

    const removedProducts: string[] = [];
    const reactivatedProducts: string[] = [];

    // Find products that are no longer in the current crawl
    for (const product of allProducts) {
      if (!currentExternalIds.includes(product.externalId)) {
        // Mark as removed
        await ctx.db.patch(product._id, {
          isActive: false,
          removedAt: now,
          updatedAt: now,
        });
        removedProducts.push(product.name);
      }
    }

    // Find products that were previously removed but are now back
    const previouslyRemovedProducts = await ctx.db
      .query('products')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .filter((q) => q.eq(q.field('isActive'), false))
      .collect();

    for (const product of previouslyRemovedProducts) {
      if (currentExternalIds.includes(product.externalId)) {
        // Reactivate the product
        await ctx.db.patch(product._id, {
          isActive: true,
          removedAt: undefined,
          updatedAt: now,
        });
        reactivatedProducts.push(product.name);
      }
    }

    return {
      removed: removedProducts.length,
      removedProducts,
      reactivated: reactivatedProducts.length,
      reactivatedProducts,
    };
  },
});

export const getActiveProducts = query({
  args: { cafeId: v.id('cafes') },
  handler: async (ctx, { cafeId }) => {
    return await ctx.db
      .query('products')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .filter((q) => q.eq(q.field('isActive'), true))
      .collect();
  },
});

export const getRemovedProducts = query({
  args: { cafeId: v.id('cafes') },
  handler: async (ctx, { cafeId }) => {
    return await ctx.db
      .query('products')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .filter((q) => q.eq(q.field('isActive'), false))
      .collect();
  },
});

export const activateAllProducts = mutation({
  args: {},
  handler: async (ctx) => {
    const startTime = Date.now();

    // Get all products
    const allProducts = await ctx.db.query('products').collect();

    const results = {
      processed: 0,
      activated: 0,
      alreadyActive: 0,
      errors: [] as string[],
      processingTime: 0,
    };

    const now = Date.now();

    for (const product of allProducts) {
      results.processed++;

      try {
        // Check if product needs activation
        if (product.isActive === false || product.isActive === undefined) {
          // Activate the product
          await ctx.db.patch(product._id, {
            isActive: true,
            updatedAt: now,
            // Clear removedAt if it was set
            removedAt: undefined,
          });
          results.activated++;
        } else {
          results.alreadyActive++;
        }
      } catch (error) {
        results.errors.push(
          `Failed to activate product ${product.name}: ${error}`
        );
      }
    }

    results.processingTime = Date.now() - startTime;
    return results;
  },
});
