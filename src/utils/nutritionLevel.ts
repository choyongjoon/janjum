import type { Nutritions } from '~/../../shared/nutritions';

type NutritionLevelText = '거의 없음' | '적음' | '보통' | '많음';

interface NutritionLevelTextMap {
  calories: NutritionLevelText;
  carbohydrates: NutritionLevelText;
  sugar: NutritionLevelText;
  saturatedFat: NutritionLevelText;
  caffeine: NutritionLevelText;
}

interface NutritionLevel {
  text: NutritionLevelText;
  color: string;
}

interface NutritionLevelMap {
  calories: NutritionLevel;
  carbohydrates: NutritionLevel;
  sugar: NutritionLevel;
  saturatedFat: NutritionLevel;
  caffeine: NutritionLevel;
}

function getCaloriesLevelText(
  calories: number | null | undefined
): NutritionLevelText {
  if (!calories || calories <= 50) {
    return '거의 없음';
  }
  if (calories <= 150) {
    return '적음';
  }
  if (calories <= 300) {
    return '보통';
  }
  return '많음';
}

function getCarbohydratesLevelText(
  carbohydrates: number | null | undefined
): NutritionLevelText {
  if (!carbohydrates || carbohydrates <= 10) {
    return '거의 없음';
  }
  if (carbohydrates <= 25) {
    return '적음';
  }
  if (carbohydrates <= 50) {
    return '보통';
  }
  return '많음';
}

function getSugarLevelText(
  sugar: number | null | undefined
): NutritionLevelText {
  if (!sugar || sugar <= 5) {
    return '거의 없음';
  }
  if (sugar <= 20) {
    return '적음';
  }
  if (sugar <= 40) {
    return '보통';
  }
  return '많음';
}

function getSaturatedFatLevelText(
  saturatedFat: number | null | undefined
): NutritionLevelText {
  if (!saturatedFat || saturatedFat <= 1) {
    return '거의 없음';
  }
  if (saturatedFat <= 3) {
    return '적음';
  }
  if (saturatedFat <= 6) {
    return '보통';
  }
  return '많음';
}

function getCaffeineLevelText(
  caffeine: number | null | undefined
): NutritionLevelText {
  if (!caffeine || caffeine <= 30) {
    return '거의 없음';
  }
  if (caffeine <= 80) {
    return '적음';
  }
  if (caffeine <= 150) {
    return '보통';
  }
  return '많음';
}

function getNutritionLevelTextMap(
  nutritions: Nutritions | null | undefined
): NutritionLevelTextMap {
  if (!nutritions) {
    return {
      calories: '거의 없음',
      carbohydrates: '거의 없음',
      sugar: '거의 없음',
      saturatedFat: '거의 없음',
      caffeine: '거의 없음',
    };
  }

  return {
    calories: getCaloriesLevelText(nutritions.calories),
    carbohydrates: getCarbohydratesLevelText(nutritions.carbohydrates),
    sugar: getSugarLevelText(nutritions.sugar),
    saturatedFat: getSaturatedFatLevelText(nutritions.saturatedFat),
    caffeine: getCaffeineLevelText(nutritions.caffeine),
  };
}

function getNutritionLevelColor(
  nutritionType: keyof NutritionLevelTextMap,
  level: NutritionLevelText
): string {
  // For nutrients that are better when lower (restrictive)
  const restrictiveNutrients = [
    'calories',
    'carbohydrates',
    'sugar',
    'saturatedFat',
  ];

  if (restrictiveNutrients.includes(nutritionType)) {
    const restrictiveColors = {
      '거의 없음': 'success', // Green - excellent
      적음: 'success', // Green - good
      보통: 'warning', // Yellow - moderate
      많음: 'error', // Red - concerning
    };
    return restrictiveColors[level];
  }

  // For neutral nutrients (caffeine - depends on preference)
  const neutralColors = {
    '거의 없음': 'neutral',
    적음: 'neutral',
    보통: 'neutral',
    많음: 'neutral',
  };
  return neutralColors[level];
}

function getNutritionLevel(
  nutritionType: keyof NutritionLevelTextMap,
  text: NutritionLevelText
): NutritionLevel {
  return {
    text,
    color: getNutritionLevelColor(nutritionType, text),
  };
}

/**
 * Gets all nutrition progresses for a nutrition object
 * @param nutritions - Nutrition data object
 * @returns Object with nutrition progresses containing level, label, and badge class
 */
export function getNutritionLevelMap(
  nutritions: Nutritions | null | undefined
): NutritionLevelMap {
  const categories = getNutritionLevelTextMap(nutritions);

  return {
    calories: getNutritionLevel('calories', categories.calories),
    carbohydrates: getNutritionLevel('carbohydrates', categories.carbohydrates),
    sugar: getNutritionLevel('sugar', categories.sugar),
    saturatedFat: getNutritionLevel('saturatedFat', categories.saturatedFat),
    caffeine: getNutritionLevel('caffeine', categories.caffeine),
  };
}
