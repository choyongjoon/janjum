export interface Nutritions {
  caffeine?: number;
  caffeineUnit?: string;
  calories?: number;
  caloriesUnit?: string;
  carbohydrates?: number;
  carbohydratesUnit?: string;
  cholesterol?: number;
  cholesterolUnit?: string;
  fat?: number;
  fatUnit?: string;
  natrium?: number;
  natriumUnit?: string;
  protein?: number;
  proteinUnit?: string;
  saturatedFat?: number;
  saturatedFatUnit?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  sugar?: number;
  sugarUnit?: string;
  transFat?: number;
  transFatUnit?: string;
}

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
