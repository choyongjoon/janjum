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
    .index('by_cafe_external_id', ['cafeId', 'externalId'])
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
});
