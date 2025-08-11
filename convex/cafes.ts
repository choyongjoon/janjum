import { v } from 'convex/values';
import { query } from './_generated/server';

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
