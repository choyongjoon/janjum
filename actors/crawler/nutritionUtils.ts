import { logger } from '../../shared/logger';
import type { Nutritions } from '../../shared/nutritions';

// ================================================
// SHARED NUTRITION PATTERNS
// ================================================

export const NUTRITION_PATTERNS = {
  servingSize: /(\d+)\s*(ml|mL|ML|g|gram)/i,
  calories: /(\d+)\s*(kcal|칼로리|열량)/i,
  protein: /단백질.*?(\d+(?:\.\d+)?)\s*(g|gram)/i,
  fat: /지방.*?(\d+(?:\.\d+)?)\s*(g|gram)/i,
  carbohydrates: /탄수화물.*?(\d+(?:\.\d+)?)\s*(g|gram)/i,
  sugar: /당류.*?(\d+(?:\.\d+)?)\s*(g|gram)/i,
  sodium: /나트륨.*?(\d+(?:\.\d+)?)\s*(mg|milligram)/i,
  caffeine: /카페인.*?(\d+(?:\.\d+)?)\s*(mg|milligram)/i,
} as const;

// ================================================
// SHARED PARSING FUNCTIONS
// ================================================

export function parseNutritionValue(
  match: RegExpMatchArray | null
): number | null {
  if (!match?.[1]) {
    return null;
  }
  const value = Number.parseFloat(match[1]);
  return Number.isNaN(value) ? null : value;
}

export function parseNutritionValueFromText(
  text: string | null
): number | null {
  if (!text || text.trim() === '' || text.trim() === '-') {
    return null;
  }
  const parsed = Number.parseFloat(text.trim());
  return Number.isNaN(parsed) ? null : parsed;
}

// ================================================
// NUTRITION DATA EXTRACTION
// ================================================

export interface NutritionMatches {
  servingSize: RegExpMatchArray | null;
  calories: RegExpMatchArray | null;
  protein: RegExpMatchArray | null;
  fat: RegExpMatchArray | null;
  carbohydrates: RegExpMatchArray | null;
  sugar: RegExpMatchArray | null;
  sodium: RegExpMatchArray | null;
  caffeine: RegExpMatchArray | null;
}

export interface NutritionValues {
  servingSize: number | null;
  calories: number | null;
  protein: number | null;
  fat: number | null;
  carbohydrates: number | null;
  sugar: number | null;
  sodium: number | null;
  caffeine: number | null;
}

export function parseNutritionMatches(nutritionText: string): NutritionMatches {
  return {
    servingSize: nutritionText.match(NUTRITION_PATTERNS.servingSize),
    calories: nutritionText.match(NUTRITION_PATTERNS.calories),
    protein: nutritionText.match(NUTRITION_PATTERNS.protein),
    fat: nutritionText.match(NUTRITION_PATTERNS.fat),
    carbohydrates: nutritionText.match(NUTRITION_PATTERNS.carbohydrates),
    sugar: nutritionText.match(NUTRITION_PATTERNS.sugar),
    sodium: nutritionText.match(NUTRITION_PATTERNS.sodium),
    caffeine: nutritionText.match(NUTRITION_PATTERNS.caffeine),
  };
}

export function parseNutritionValues(
  matches: NutritionMatches
): NutritionValues {
  return {
    servingSize: parseNutritionValue(matches.servingSize),
    calories: parseNutritionValue(matches.calories),
    protein: parseNutritionValue(matches.protein),
    fat: parseNutritionValue(matches.fat),
    carbohydrates: parseNutritionValue(matches.carbohydrates),
    sugar: parseNutritionValue(matches.sugar),
    sodium: parseNutritionValue(matches.sodium),
    caffeine: parseNutritionValue(matches.caffeine),
  };
}

// ================================================
// SERVING SIZE UTILITIES
// ================================================

export function getServingSizeUnit(
  matches: NutritionMatches,
  hasValue: boolean
): string | null {
  if (!hasValue) {
    return null;
  }
  const unitText = matches.servingSize?.[2]?.toLowerCase();
  return unitText?.includes('ml') ? 'ml' : 'g';
}

// ================================================
// NUTRITION VALIDATION
// ================================================

export function hasAnyNutritionData(values: NutritionValues): boolean {
  return (
    values.servingSize !== null ||
    values.calories !== null ||
    values.protein !== null ||
    values.fat !== null
  );
}

export function hasNutritionKeywords(text: string): boolean {
  return (
    text.includes('칼로리') ||
    text.includes('kcal') ||
    text.includes('단백질') ||
    text.includes('지방') ||
    text.includes('탄수화물') ||
    text.includes('당류') ||
    text.includes('나트륨') ||
    text.includes('카페인') ||
    text.includes('영양') ||
    text.includes('성분')
  );
}

// ================================================
// NUTRITION OBJECT CREATION
// ================================================

export function createNutritionObject(
  values: NutritionValues,
  matches: NutritionMatches
): Nutritions {
  return {
    servingSize: values.servingSize,
    servingSizeUnit: getServingSizeUnit(matches, values.servingSize !== null),
    calories: values.calories,
    caloriesUnit: values.calories !== null ? 'kcal' : null,
    carbohydrates: values.carbohydrates,
    carbohydratesUnit: values.carbohydrates !== null ? 'g' : null,
    sugar: values.sugar,
    sugarUnit: values.sugar !== null ? 'g' : null,
    protein: values.protein,
    proteinUnit: values.protein !== null ? 'g' : null,
    fat: values.fat,
    fatUnit: values.fat !== null ? 'g' : null,
    transFat: null,
    transFatUnit: null,
    saturatedFat: null,
    saturatedFatUnit: null,
    natrium: values.sodium,
    natriumUnit: values.sodium !== null ? 'mg' : null,
    cholesterol: null,
    cholesterolUnit: null,
    caffeine: values.caffeine,
    caffeineUnit: values.caffeine !== null ? 'mg' : null,
  };
}

// ================================================
// MAIN EXTRACTION FUNCTION
// ================================================

export function extractNutritionFromText(
  nutritionText: string
): Nutritions | null {
  try {
    const matches = parseNutritionMatches(nutritionText);
    const values = parseNutritionValues(matches);

    if (hasAnyNutritionData(values)) {
      return createNutritionObject(values, matches);
    }
  } catch (error) {
    logger.debug('Failed to extract nutrition data from text:', error);
  }
  return null;
}
