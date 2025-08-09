import type { RatingDistribution } from '../../../convex/reviews';
import { RATING_TEXTS } from '../../../convex/reviews';

interface UserRatingHistogramProps {
  ratingDistribution: RatingDistribution;
  totalReviews: number;
}

export function UserRatingHistogram({
  ratingDistribution,
  totalReviews,
}: UserRatingHistogramProps) {
  if (totalReviews === 0) {
    return (
      <div className="py-8 text-center text-base-content/60">
        <p>아직 작성한 후기가 없습니다.</p>
      </div>
    );
  }

  const maxCount = Math.max(...Object.values(ratingDistribution));
  const ratings = [5, 4.5, 4, 3.5, 3, 2, 1] as const;

  return (
    <div className="space-y-3">
      <h4 className="mb-4 font-medium text-base-content">내 평점 분포</h4>

      {ratings.map((rating) => {
        const count = ratingDistribution[rating];
        const barWidth = maxCount > 0 ? (count / maxCount) * 100 : 0;

        return (
          <div className="flex items-center gap-3" key={rating}>
            <div className="flex w-20 items-center justify-between gap-2">
              <span className="text-base-content/60 text-xs">
                {RATING_TEXTS[rating]}
              </span>
              <span className="font-medium text-sm">{rating}</span>
            </div>

            <div className="flex flex-1 items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-base-200">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${barWidth}%` }}
                />
              </div>

              <div className="flex min-w-0 items-center gap-1 text-sm">
                <span className="font-medium text-base-content">{count}</span>
              </div>
            </div>
          </div>
        );
      })}

      <div className="mt-4 border-base-200 border-t pt-3">
        <div className="flex justify-between text-sm">
          <span className="text-base-content/60">총 후기 수</span>
          <span className="font-medium">{totalReviews}개</span>
        </div>
      </div>
    </div>
  );
}
