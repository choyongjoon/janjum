import { v } from 'convex/values';
import type { Nutritions } from '../shared/nutritions';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { type MutationCtx, mutation, query } from './_generated/server';

export const getByCafe = query({
  args: { cafeId: v.id('cafes') },
  handler: async (ctx, { cafeId }) => {
    const products = await ctx.db
      .query('products')
      .withIndex('by_cafe_active', (q) =>
        q.eq('cafeId', cafeId).eq('isActive', true)
      )
      .collect();

    const productsWithImages = await Promise.all(
      products.map(async (product) => ({
        ...product,
        imageUrl: product.imageStorageId
          ? (await ctx.storage.getUrl(product.imageStorageId)) || undefined
          : undefined,
      }))
    );

    // Sort by addedAt in descending order (recently created first)
    return productsWithImages.sort((a, b) => b.addedAt - a.addedAt);
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

    // Filter by cafe if specified
    let products = cafeId
      ? await ctx.db
          .query('products')
          .withIndex('by_cafe_active', (q) =>
            q.eq('cafeId', cafeId).eq('isActive', true)
          )
          .collect()
      : await ctx.db
          .query('products')
          .filter((q) => q.eq(q.field('isActive'), true))
          .collect();

    // Filter by category if specified
    if (category) {
      products = products.filter(
        (p) => p.category?.toLowerCase() === category.toLowerCase()
      );
    }

    // Filter by search term if specified
    if (searchTerm?.trim()) {
      const term = searchTerm.toLowerCase().replace(/\s+/g, '');
      products = products.filter((p) =>
        p.name.toLowerCase().replace(/\s+/g, '').includes(term)
      );
    }

    // Get cafe information for each product
    const productWithCafes = await Promise.all(
      products.map(async (product) => {
        const cafe = await ctx.db.get(product.cafeId);
        return {
          ...product,
          cafeName: cafe?.name || '',
          imageUrl: product.imageStorageId
            ? (await ctx.storage.getUrl(product.imageStorageId)) || undefined
            : undefined,
        };
      })
    );

    // Sort by name and limit results
    return productWithCafes
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit);
  },
});

export const getSuggestions = query({
  args: {
    searchTerm: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { searchTerm, limit = 10 }) => {
    if (!searchTerm.trim()) {
      return [];
    }

    const products = await ctx.db.query('products').collect();
    const term = searchTerm.toLowerCase().replace(/\s+/g, '');

    // Filter active products and search in name/nameEn
    const matches = products
      .filter((p) => p.isActive)
      .filter(
        (p) =>
          p.name.toLowerCase().replace(/\s+/g, '').includes(term) ||
          p.nameEn?.toLowerCase().replace(/\s+/g, '').includes(term)
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
  nutritions?: Nutritions;
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
  nutritions?: Nutritions;
  isActive?: boolean;
  removedAt?: number;
};

function hasNutritionChanges(
  existing?: Nutritions,
  args?: Nutritions
): boolean {
  if (!(existing || args)) {
    return false;
  }
  if (!existing && args) {
    return true;
  }
  if (existing && !args) {
    return true;
  }
  if (!(existing && args)) {
    return false;
  }

  return (
    existing.servingSize !== args.servingSize ||
    existing.servingSizeUnit !== args.servingSizeUnit ||
    existing.calories !== args.calories ||
    existing.caloriesUnit !== args.caloriesUnit ||
    existing.carbohydrates !== args.carbohydrates ||
    existing.carbohydratesUnit !== args.carbohydratesUnit ||
    existing.sugar !== args.sugar ||
    existing.sugarUnit !== args.sugarUnit ||
    existing.protein !== args.protein ||
    existing.proteinUnit !== args.proteinUnit ||
    existing.fat !== args.fat ||
    existing.fatUnit !== args.fatUnit ||
    existing.transFat !== args.transFat ||
    existing.transFatUnit !== args.transFatUnit ||
    existing.saturatedFat !== args.saturatedFat ||
    existing.saturatedFatUnit !== args.saturatedFatUnit ||
    existing.natrium !== args.natrium ||
    existing.natriumUnit !== args.natriumUnit ||
    existing.cholesterol !== args.cholesterol ||
    existing.cholesterolUnit !== args.cholesterolUnit ||
    existing.caffeine !== args.caffeine ||
    existing.caffeineUnit !== args.caffeineUnit
  );
}

function hasProductChanges(
  existing: ExistingProduct,
  args: UpsertProductArgs
): boolean {
  const wasActive = existing.isActive ?? true;
  const willBeActive = args.isActive ?? true;

  return (
    existing.name !== args.name ||
    existing.category !== args.category ||
    existing.price !== args.price ||
    existing.description !== args.description ||
    existing.externalImageUrl !== args.externalImageUrl ||
    existing.imageStorageId !== args.imageStorageId ||
    hasNutritionChanges(existing.nutritions, args.nutritions) ||
    wasActive !== willBeActive ||
    // If becoming active and had removedAt, that's a change
    (willBeActive && existing.removedAt !== undefined)
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
      uploadSecret: process.env.CONVEX_UPLOAD_SECRET,
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
    const isNowActive = args.isActive ?? true;
    const updateData = {
      ...args,
      updatedAt: now,
      isActive: isNowActive,
      removedAt: isNowActive ? undefined : (existing.removedAt ?? now),
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
    nutritions: v.optional(
      v.object({
        servingSize: v.optional(v.number()),
        servingSizeUnit: v.optional(v.string()),
        calories: v.optional(v.number()),
        caloriesUnit: v.optional(v.string()),
        carbohydrates: v.optional(v.number()),
        carbohydratesUnit: v.optional(v.string()),
        sugar: v.optional(v.number()),
        sugarUnit: v.optional(v.string()),
        protein: v.optional(v.number()),
        proteinUnit: v.optional(v.string()),
        fat: v.optional(v.number()),
        fatUnit: v.optional(v.string()),
        transFat: v.optional(v.number()),
        transFatUnit: v.optional(v.string()),
        saturatedFat: v.optional(v.number()),
        saturatedFatUnit: v.optional(v.string()),
        natrium: v.optional(v.number()),
        natriumUnit: v.optional(v.string()),
        cholesterol: v.optional(v.number()),
        cholesterolUnit: v.optional(v.string()),
        caffeine: v.optional(v.number()),
        caffeineUnit: v.optional(v.string()),
      })
    ),
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

export const getById = query({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    return await ctx.db.get(productId);
  },
});

export const getByShortId = query({
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

export const updateImage = mutation({
  args: {
    productId: v.id('products'),
    storageId: v.id('_storage'),
    uploadSecret: v.optional(v.string()),
  },
  handler: async (ctx, { productId, storageId, uploadSecret }) => {
    // Verify upload secret for protected operations
    const expectedSecret = process.env.CONVEX_UPLOAD_SECRET;
    if (expectedSecret && uploadSecret !== expectedSecret) {
      throw new Error('Unauthorized: Invalid upload secret');
    }

    // Get the current product to check for existing image
    const product = await ctx.db.get(productId);
    if (!product) {
      throw new Error(`Product ${productId} not found`);
    }

    const oldImageStorageId = product.imageStorageId;
    const now = Date.now();

    // Update product with new image
    await ctx.db.patch(productId, {
      imageStorageId: storageId,
      updatedAt: now,
    });

    // Clean up old image if it exists and is different from new one
    if (oldImageStorageId && oldImageStorageId !== storageId) {
      try {
        await ctx.storage.delete(oldImageStorageId);
      } catch (_error) {
        // Old image cleanup is not critical - don't fail the update
      }
    }

    return { success: true, oldImageCleaned: !!oldImageStorageId };
  },
});

export const getAllWithImages = query({
  args: {},
  handler: async (ctx) => {
    const products = await ctx.db
      .query('products')
      .filter((q) => q.neq(q.field('imageStorageId'), undefined))
      .collect();

    return products;
  },
});

export const deleteProduct = mutation({
  args: {
    productId: v.id('products'),
    uploadSecret: v.optional(v.string()),
  },
  handler: async (ctx, { productId, uploadSecret }) => {
    // Verify upload secret for protected operations
    const expectedSecret = process.env.CONVEX_UPLOAD_SECRET;
    if (expectedSecret && uploadSecret !== expectedSecret) {
      throw new Error('Unauthorized: Invalid upload secret');
    }

    const product = await ctx.db.get(productId);
    if (!product) {
      return { success: false, error: 'Product not found' };
    }

    // Clean up associated image
    if (product.imageStorageId) {
      try {
        await ctx.storage.delete(product.imageStorageId);
      } catch (_error) {
        // Image cleanup failure - not critical for product deletion
      }
    }

    // Delete the product
    await ctx.db.delete(productId);

    return { success: true, imageCleaned: !!product.imageStorageId };
  },
});

export const markAsRemoved = mutation({
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
