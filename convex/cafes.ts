import { v } from 'convex/values';
import { query } from './_generated/server';

export const list = query({
  args: {},
  handler: async (ctx) => {
    const cafes = await ctx.db.query('cafes').collect();
    return cafes.sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query('cafes')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .first();
  },
});

export const getById = query({
  args: { cafeId: v.id('cafes') },
  handler: async (ctx, { cafeId }) => {
    return await ctx.db.get(cafeId);
  },
});

export const getImageUrl = query({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, { storageId }) => {
    return await ctx.storage.getUrl(storageId);
  },
});
