import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const create = mutation({
  args: {
    productId: v.id('products'),
    oldPrice: v.optional(v.number()),
    newPrice: v.number(),
    priceChange: v.optional(v.number()),
    priceChangePercent: v.optional(v.number()),
    source: v.string(),
    timestamp: v.number(),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('price_history', args);
  },
});

export const getByProduct = query({
  args: {
    productId: v.id('products'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('price_history')
      .withIndex('by_product', (q) => q.eq('productId', args.productId))
      .order('desc')
      .take(args.limit || 50);
  },
});

export const getRecentPriceChanges = query({
  args: {
    hoursBack: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const hoursBack = args.hoursBack || 24;
    const limit = args.limit || 100;
    const cutoffTime = Date.now() - hoursBack * 60 * 60 * 1000;

    return await ctx.db
      .query('price_history')
      .withIndex('by_timestamp', (q) => q.gte('timestamp', cutoffTime))
      .order('desc')
      .take(limit);
  },
});
