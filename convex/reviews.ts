import { v } from 'convex/values';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';

/**
 * Rating scale mapping for Korean labels
 */
export const RATING_TEXTS = {
  1: '최악',
  2: '별로',
  3: '보통',
  3.5: '좋음',
  4: '추천',
  4.5: '강력 추천',
  5: '최고',
} as const;

export type RatingDistribution = {
  [key in 1 | 2 | 3 | 3.5 | 4 | 4.5 | 5]: number;
};

/**
 * Get all reviews for a product
 */
export const getByProduct = query({
  args: {
    productId: v.id('products'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { productId, limit = 50 }) => {
    const reviews = await ctx.db
      .query('reviews')
      .withIndex('by_product', (q) => q.eq('productId', productId))
      .filter((q) => q.neq(q.field('isVisible'), false)) // Show visible reviews
      .order('desc')
      .take(limit);

    // Add image URLs for review photos
    const reviewsWithImages = await Promise.all(
      reviews.map(async (review) => {
        let imageUrls: string[] = [];
        if (review.imageStorageIds) {
          imageUrls = await Promise.all(
            review.imageStorageIds.map(async (storageId) => {
              return (await ctx.storage.getUrl(storageId)) || '';
            })
          );
        }

        return {
          ...review,
          imageUrls,
          ratingText:
            RATING_TEXTS[review.rating as keyof typeof RATING_TEXTS] || '',
        };
      })
    );

    return reviewsWithImages;
  },
});

/**
 * Get review statistics for a product
 */
export const getProductStats = query({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const reviews = await ctx.db
      .query('reviews')
      .withIndex('by_product', (q) => q.eq('productId', productId))
      .filter((q) => q.neq(q.field('isVisible'), false))
      .collect();

    if (reviews.length === 0) {
      return {
        averageRating: 0,
        totalReviews: 0,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 3.5: 0, 4: 0, 4.5: 0, 5: 0 },
      };
    }

    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = Number((totalRating / reviews.length).toFixed(1));

    // Count distribution of ratings
    const ratingDistribution: RatingDistribution = {
      1: 0,
      2: 0,
      3: 0,
      3.5: 0,
      4: 0,
      4.5: 0,
      5: 0,
    };
    for (const review of reviews) {
      const rating = review.rating as keyof typeof ratingDistribution;
      if (rating in ratingDistribution) {
        ratingDistribution[rating]++;
      }
    }

    return {
      averageRating,
      totalReviews: reviews.length,
      ratingDistribution,
    };
  },
});

/**
 * Check if user has already reviewed a product
 */
export const getUserReview = query({
  args: {
    productId: v.id('products'),
    userId: v.string(),
  },
  handler: async (ctx, { productId, userId }) => {
    const review = await ctx.db
      .query('reviews')
      .withIndex('by_product', (q) => q.eq('productId', productId))
      .filter((q) => q.eq(q.field('userId'), userId))
      .first();

    if (!review) {
      return null;
    }

    // Add image URLs
    let imageUrls: string[] = [];
    if (review.imageStorageIds) {
      imageUrls = await Promise.all(
        review.imageStorageIds.map(async (storageId) => {
          return (await ctx.storage.getUrl(storageId)) || '';
        })
      );
    }

    return {
      ...review,
      imageUrls,
      ratingText:
        RATING_TEXTS[review.rating as keyof typeof RATING_TEXTS] || '',
    };
  },
});

/**
 * Create or update a review
 */
export const upsertReview = mutation({
  args: {
    productId: v.id('products'),
    userId: v.string(),
    rating: v.number(),
    text: v.optional(v.string()),
    imageStorageIds: v.optional(v.array(v.id('_storage'))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Validate rating
    const validRatings = [1, 2, 3, 3.5, 4, 4.5, 5];
    if (!validRatings.includes(args.rating)) {
      throw new Error(
        'Invalid rating. Must be one of: 1, 2, 3, 3.5, 4, 4.5, 5'
      );
    }

    // Validate image count (max 2)
    if (args.imageStorageIds && args.imageStorageIds.length > 2) {
      throw new Error('Maximum 2 images allowed per review');
    }

    // Check if user already has a review for this product
    const existingReview = await ctx.db
      .query('reviews')
      .withIndex('by_product', (q) => q.eq('productId', args.productId))
      .filter((q) => q.eq(q.field('userId'), args.userId))
      .first();

    let reviewId: Id<'reviews'>;

    if (existingReview) {
      // Update existing review
      await ctx.db.patch(existingReview._id, {
        rating: args.rating,
        text: args.text,
        imageStorageIds: args.imageStorageIds,
        updatedAt: now,
        isVisible: true, // Reset visibility on update
      });
      reviewId = existingReview._id;
    } else {
      // Create new review
      reviewId = await ctx.db.insert('reviews', {
        productId: args.productId,
        userId: args.userId,
        rating: args.rating,
        text: args.text,
        imageStorageIds: args.imageStorageIds,
        createdAt: now,
        updatedAt: now,
        isVisible: true,
      });
    }

    // Update product aggregation stats
    await ctx.runMutation(api.reviews.updateProductStats, {
      productId: args.productId,
    });

    return { reviewId, action: existingReview ? 'updated' : 'created' };
  },
});

/**
 * Delete a review
 */
export const deleteReview = mutation({
  args: {
    reviewId: v.id('reviews'),
    userId: v.string(), // For authorization
  },
  handler: async (ctx, { reviewId, userId }) => {
    const review = await ctx.db.get(reviewId);

    if (!review) {
      throw new Error('Review not found');
    }

    if (review.userId !== userId) {
      throw new Error('Unauthorized: Can only delete your own reviews');
    }

    await ctx.db.delete(reviewId);

    // Update product aggregation stats
    await ctx.runMutation(api.reviews.updateProductStats, {
      productId: review.productId,
    });

    return { success: true };
  },
});

/**
 * Update product rating aggregation statistics
 */
export const updateProductStats = mutation({
  args: { productId: v.id('products') },
  handler: async (ctx, { productId }) => {
    const reviews = await ctx.db
      .query('reviews')
      .withIndex('by_product', (q) => q.eq('productId', productId))
      .filter((q) => q.neq(q.field('isVisible'), false))
      .collect();

    const totalReviews = reviews.length;
    let averageRating = 0;

    if (totalReviews > 0) {
      const totalRating = reviews.reduce(
        (sum, review) => sum + review.rating,
        0
      );
      averageRating = Number((totalRating / totalReviews).toFixed(1));
    }

    await ctx.db.patch(productId, {
      averageRating,
      totalReviews,
    });

    return { averageRating, totalReviews };
  },
});

/**
 * Generate upload URL for review images
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Get all reviews by a specific user
 */
export const getUserReviews = query({
  args: {
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { userId, limit = 50 }) => {
    const reviews = await ctx.db
      .query('reviews')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .filter((q) => q.neq(q.field('isVisible'), false))
      .order('desc')
      .take(limit);

    // Get product information for each review
    const reviewsWithProducts = await Promise.all(
      reviews.map(async (review) => {
        const product = await ctx.db.get(review.productId);

        let imageUrls: string[] = [];
        if (review.imageStorageIds) {
          imageUrls = await Promise.all(
            review.imageStorageIds.map(async (storageId) => {
              return (await ctx.storage.getUrl(storageId)) || '';
            })
          );
        }

        return {
          ...review,
          product,
          imageUrls,
          ratingText:
            RATING_TEXTS[review.rating as keyof typeof RATING_TEXTS] || '',
        };
      })
    );

    return reviewsWithProducts;
  },
});

/**
 * Get user's review statistics
 */
export const getUserStats = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const reviews = await ctx.db
      .query('reviews')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .filter((q) => q.neq(q.field('isVisible'), false))
      .collect();

    if (reviews.length === 0) {
      return {
        totalReviews: 0,
        averageRating: 0,
        ratingDistribution: { 1: 0, 2: 0, 3: 0, 3.5: 0, 4: 0, 4.5: 0, 5: 0 },
      };
    }

    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = Number((totalRating / reviews.length).toFixed(1));

    // Count distribution of ratings
    const ratingDistribution: RatingDistribution = {
      1: 0,
      2: 0,
      3: 0,
      3.5: 0,
      4: 0,
      4.5: 0,
      5: 0,
    };
    for (const review of reviews) {
      const rating = review.rating as keyof typeof ratingDistribution;
      if (rating in ratingDistribution) {
        ratingDistribution[rating]++;
      }
    }

    return {
      totalReviews: reviews.length,
      averageRating,
      ratingDistribution,
    };
  },
});

/**
 * Get recent reviews across all products (for homepage, etc.)
 */
export const getRecentReviews = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 10 }) => {
    const reviews = await ctx.db
      .query('reviews')
      .withIndex('by_created_at')
      .filter((q) => q.neq(q.field('isVisible'), false))
      .order('desc')
      .take(limit);

    // Get product information for each review
    const reviewsWithProducts = await Promise.all(
      reviews.map(async (review) => {
        const product = await ctx.db.get(review.productId);

        let imageUrls: string[] = [];
        if (review.imageStorageIds) {
          imageUrls = await Promise.all(
            review.imageStorageIds.map(async (storageId) => {
              return (await ctx.storage.getUrl(storageId)) || '';
            })
          );
        }

        return {
          ...review,
          product,
          imageUrls,
          ratingText:
            RATING_TEXTS[review.rating as keyof typeof RATING_TEXTS] || '',
        };
      })
    );

    return reviewsWithProducts;
  },
});

/**
 * Get individual review by ID with product context
 */
export const getById = query({
  args: { reviewId: v.id('reviews') },
  handler: async (ctx, { reviewId }) => {
    const review = await ctx.db.get(reviewId);

    if (!review || review.isVisible === false) {
      return null;
    }

    // Get product information
    const product = await ctx.db.get(review.productId);
    if (!product) {
      return null;
    }

    // Get cafe information
    const cafe = await ctx.db.get(product.cafeId);

    // Add image URLs
    let imageUrls: string[] = [];
    if (review.imageStorageIds) {
      imageUrls = await Promise.all(
        review.imageStorageIds.map(async (storageId) => {
          return (await ctx.storage.getUrl(storageId)) || '';
        })
      );
    }

    return {
      ...review,
      product,
      cafe,
      imageUrls,
      ratingText:
        RATING_TEXTS[review.rating as keyof typeof RATING_TEXTS] || '',
    };
  },
});

export const getAllWithImages = query({
  args: {},
  handler: async (ctx) => {
    const reviews = await ctx.db
      .query('reviews')
      .filter((q) => q.neq(q.field('imageStorageIds'), undefined))
      .collect();

    return reviews;
  },
});

export const updateImages = mutation({
  args: {
    reviewId: v.id('reviews'),
    imageStorageIds: v.array(v.id('_storage')),
    uploadSecret: v.optional(v.string()),
  },
  handler: async (ctx, { reviewId, imageStorageIds, uploadSecret }) => {
    // Verify upload secret for protected operations
    const expectedSecret = process.env.CONVEX_UPLOAD_SECRET;
    if (expectedSecret && uploadSecret !== expectedSecret) {
      throw new Error('Unauthorized: Invalid upload secret');
    }

    const now = Date.now();

    await ctx.db.patch(reviewId, {
      imageStorageIds,
      updatedAt: now,
    });

    return { success: true };
  },
});
