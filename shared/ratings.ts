/**
 * Rating scale mapping for Korean labels
 */
export const RATING_TEXTS = {
  1: "최악",
  2: "별로",
  3: "보통",
  3.5: "좋음",
  4: "추천",
  4.5: "강력 추천",
  5: "최고",
} as const;

/**
 * Valid rating values in ascending order
 */
export const RATING_VALUES = [1, 2, 3, 3.5, 4, 4.5, 5] as const;

export type RatingValue = (typeof RATING_VALUES)[number];

export type RatingDistribution = {
  [key in RatingValue]: number;
};
