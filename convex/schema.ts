import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  cafes: defineTable({
    name: v.string(),
    slug: v.string(),
    imageStorageId: v.optional(v.id('_storage')),
    rank: v.optional(v.number()),
  }).index('by_slug', ['slug']),
  products: defineTable({
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
    isActive: v.optional(v.boolean()), // Track if product is currently available on cafe website
    addedAt: v.number(),
    updatedAt: v.number(),
    removedAt: v.optional(v.number()), // When product was marked as removed
    shortId: v.string(), // Short URL-friendly ID
    // Review aggregation fields
    averageRating: v.optional(v.number()), // Cached average rating for performance
    totalReviews: v.optional(v.number()), // Cached total review count
  })
    .index('by_cafe', ['cafeId'])
    .index('by_category', ['category'])
    .index('by_external_id', ['externalId'])
    .index('by_cafe_active', ['cafeId', 'isActive'])
    .index('by_short_id', ['shortId'])
    .index('by_rating', ['averageRating']),
  reviews: defineTable({
    productId: v.id('products'),
    userId: v.string(), // Clerk user ID
    rating: v.number(), // 1-5 scale (1=최악, 2=별로, 3=보통, 3.5=좋음, 4=추천, 4.5=강력추천, 5=최고)
    text: v.optional(v.string()), // Optional review text
    imageStorageIds: v.optional(v.array(v.id('_storage'))), // Up to 2 photos
    createdAt: v.number(),
    updatedAt: v.number(),
    isVisible: v.optional(v.boolean()), // For moderation purposes
  })
    .index('by_product', ['productId'])
    .index('by_user', ['userId'])
    .index('by_product_rating', ['productId', 'rating'])
    .index('by_created_at', ['createdAt']),
  users: defineTable({
    name: v.string(),
    handle: v.string(),
    imageStorageId: v.optional(v.id('_storage')),
    hasCompletedSetup: v.optional(v.boolean()), // Track if user has completed initial setup
    // this the Clerk ID, stored in the subject JWT field
    externalId: v.string(),
  })
    .index('byExternalId', ['externalId'])
    .index('byName', ['name'])
    .index('byHandle', ['handle']),
  price_history: defineTable({
    productId: v.id('products'),
    oldPrice: v.optional(v.number()), // Previous price (null for initial price)
    newPrice: v.number(), // New price
    priceChange: v.optional(v.number()), // Change amount (newPrice - oldPrice)
    priceChangePercent: v.optional(v.number()), // Change percentage
    source: v.string(), // Source of price data (e.g., 'naver-map', 'official-website')
    timestamp: v.number(), // When the price change was detected
    createdAt: v.number(), // When this record was created
  })
    .index('by_product', ['productId'])
    .index('by_timestamp', ['timestamp'])
    .index('by_product_timestamp', ['productId', 'timestamp']),
});
