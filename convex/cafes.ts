import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const list = query({
  args: {},
  handler: async (ctx) => {
    const cafes = await ctx.db.query('cafes').collect();
    const cafesWithImageUrl = await Promise.all(
      cafes.map(async (cafe) => ({
        ...cafe,
        imageUrl: cafe.imageStorageId
          ? (await ctx.storage.getUrl(cafe.imageStorageId)) || undefined
          : undefined,
      }))
    );
    return cafesWithImageUrl.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const cafe = await ctx.db
      .query('cafes')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .first();

    if (!cafe) {
      return null;
    }

    return {
      ...cafe,
      imageUrl: cafe.imageStorageId
        ? (await ctx.storage.getUrl(cafe.imageStorageId)) || undefined
        : undefined,
    };
  },
});

export const getById = query({
  args: { cafeId: v.id('cafes') },
  handler: async (ctx, { cafeId }) => {
    return await ctx.db.get(cafeId);
  },
});

export const getAllWithImages = query({
  args: {},
  handler: async (ctx) => {
    const cafes = await ctx.db
      .query('cafes')
      .filter((q) => q.neq(q.field('imageStorageId'), undefined))
      .collect();

    // Sort by _creationTime (latest first) to prioritize recent uploads
    return cafes.sort((a, b) => b._creationTime - a._creationTime);
  },
});

export const updateImage = mutation({
  args: {
    cafeId: v.id('cafes'),
    storageId: v.id('_storage'),
    uploadSecret: v.optional(v.string()),
  },
  handler: async (ctx, { cafeId, storageId, uploadSecret }) => {
    // Verify upload secret for protected operations
    const expectedSecret = process.env.CONVEX_UPLOAD_SECRET;
    if (expectedSecret && uploadSecret !== expectedSecret) {
      throw new Error('Unauthorized: Invalid upload secret');
    }

    await ctx.db.patch(cafeId, {
      imageStorageId: storageId,
    });

    return { success: true };
  },
});
