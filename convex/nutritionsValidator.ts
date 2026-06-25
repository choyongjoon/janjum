import { type Infer, v } from "convex/values";

/**
 * Single source of truth for product nutrition fields.
 *
 * Reused by the Convex schema (`convex/schema.ts`), the `upsertProduct`
 * mutation args (`convex/products.ts`), and the shared `Nutritions` TypeScript
 * type (`shared/nutritions.ts`). Add or change a nutrition field here only.
 */
export const nutritionsValidator = v.object({
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
});

export type Nutritions = Infer<typeof nutritionsValidator>;
