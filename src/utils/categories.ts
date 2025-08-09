export type Category =
  | '커피'
  | '차'
  | '블렌디드'
  | '스무디'
  | '주스'
  | '에이드'
  | '그 외';

/**
 * Category display order for frontend
 */
export const CATEGORY_ORDER: Category[] = [
  '커피',
  '차',
  '블렌디드',
  '스무디',
  '주스',
  '에이드',
  '그 외',
];

/**
 * Sort categories according to the predefined order
 */
export function sortCategories(categories: string[]): string[] {
  return categories.sort((a, b) => {
    const indexA = CATEGORY_ORDER.indexOf(a as Category);
    const indexB = CATEGORY_ORDER.indexOf(b as Category);

    // If category is not in the predefined order, put it at the end
    const orderA = indexA === -1 ? CATEGORY_ORDER.length : indexA;
    const orderB = indexB === -1 ? CATEGORY_ORDER.length : indexB;

    return orderA - orderB;
  });
}

/**
 * Get category display order with filtering for existing categories
 */
export function getOrderedCategories(availableCategories: string[]): string[] {
  return CATEGORY_ORDER.filter((category) =>
    availableCategories.includes(category)
  );
}
