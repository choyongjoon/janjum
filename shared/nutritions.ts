// The Nutritions type is derived from the Convex validator so the field set is
// defined in exactly one place. See convex/nutritionsValidator.ts.
export type { Nutritions } from "../convex/nutritionsValidator";

export const dailyStandardNutritions = {
  calories: 2000,
  carbohydrates: 324,
  sugar: 100,
  protein: 55,
  fat: 54,
  transFat: 2,
  saturatedFat: 15,
  natrium: 2000,
  cholesterol: 300,
} as const;
