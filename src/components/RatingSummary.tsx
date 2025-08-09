import type { RatingDistribution } from 'convex/reviews';
import { RatingHistogram } from './reviews/RatingHistogram';

export function RatingSummary({
  reviewStats,
  className,
}: {
  reviewStats: {
    averageRating: number;
    totalReviews: number;
    ratingDistribution: RatingDistribution;
  };
  className?: string;
}) {
  const noReview = reviewStats.totalReviews === 0;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <RatingHistogram ratingDistribution={reviewStats.ratingDistribution} />
      <span className="font-medium text-primary">
        {noReview ? '?' : reviewStats.averageRating.toFixed(1)}
      </span>
      <span className="text-base-content/60 text-sm">
        ({reviewStats.totalReviews})
      </span>
    </div>
  );
}
