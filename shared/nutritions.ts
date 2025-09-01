export interface Nutritions {
  servingSize?: number;
  servingSizeUnit?: string;
  calories?: number;
  caloriesUnit?: string;
  carbohydrates?: number;
  carbohydratesUnit?: string;
  sugar?: number;
  sugarUnit?: string;
  protein?: number;
  proteinUnit?: string;
  fat?: number;
  fatUnit?: string;
  transFat?: number;
  transFatUnit?: string;
  saturatedFat?: number;
  saturatedFatUnit?: string;
  natrium?: number;
  natriumUnit?: string;
  cholesterol?: number;
  cholesterolUnit?: string;
  caffeine?: number;
  caffeineUnit?: string;
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
