import type { Nutritions } from '~/../../shared/nutritions';

type NutritionLevelText = '거의 없음' | '적음' | '보통' | '많음';

interface NutritionLevel {
  text: NutritionLevelText;
  color: string;
}

interface NutritionLevelMap {
  calories?: NutritionLevel;
  carbohydrates?: NutritionLevel;
  sugar?: NutritionLevel;
  saturatedFat?: NutritionLevel;
  caffeine?: NutritionLevel;
}

const nutritionLevelRangesMap = {
  calories: [50, 150, 300],
  carbohydrates: [10, 25, 50],
  sugar: [5, 20, 40],
  saturatedFat: [1, 3, 6],
  caffeine: [30, 80, 150],
};

// For nutrients that are better when lower (restrictive)
const restrictiveNutrients = [
  'calories',
  'carbohydrates',
  'sugar',
  'saturatedFat',
];

const restrictiveColors = {
  '거의 없음': 'success', // Green - excellent
  적음: 'success', // Green - good
  보통: 'warning', // Yellow - moderate
  많음: 'error', // Red - concerning
};

// For neutral nutrients (caffeine - depends on preference)
const neutralColors = {
  '거의 없음': 'neutral',
  적음: 'neutral',
  보통: 'neutral',
  많음: 'neutral',
};

function getNutritionLevel(
  nutrient: keyof NutritionLevelMap,
  value: number | null | undefined
): NutritionLevel | undefined {
  if (value === null || value === undefined) {
    return;
  }

  const ranges = nutritionLevelRangesMap[nutrient];

  const isRestrictiveNutrients = restrictiveNutrients.includes(nutrient);

  const colors = isRestrictiveNutrients ? restrictiveColors : neutralColors;

  if (value <= ranges[0]) {
    return { text: '거의 없음', color: colors['거의 없음'] };
  }
  if (value <= ranges[1]) {
    return { text: '적음', color: colors.적음 };
  }
  if (value <= ranges[2]) {
    return { text: '보통', color: colors.보통 };
  }
  return { text: '많음', color: colors.많음 };
}

/**
 * Gets all nutrition progresses for a nutrition object
 * @param nutritions - Nutrition data object
 * @returns Object with nutrition progresses containing level, label, and badge class
 */
export function getNutritionLevelMap(
  nutritions: Nutritions | null | undefined
): NutritionLevelMap {
  return {
    calories: getNutritionLevel('calories', nutritions?.calories),
    carbohydrates: getNutritionLevel(
      'carbohydrates',
      nutritions?.carbohydrates
    ),
    sugar: getNutritionLevel('sugar', nutritions?.sugar),
    saturatedFat: getNutritionLevel('saturatedFat', nutritions?.saturatedFat),
    caffeine: getNutritionLevel('caffeine', nutritions?.caffeine),
  };
}
