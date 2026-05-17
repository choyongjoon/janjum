import type { RatingDistribution } from "convex/reviews";
import { RATING_VALUES } from "convex/reviews";

const WIDE_BAR_RATINGS: readonly number[] = [1, 2, 5];

interface RatingHistogramProps {
  ratingDistribution: RatingDistribution;
}

export function RatingHistogram({ ratingDistribution }: RatingHistogramProps) {
  const maxRating = Math.max(...Object.values(ratingDistribution));

  return (
    <div className="flex items-end">
      {RATING_VALUES.map((value) => {
        const widthClassName = WIDE_BAR_RATINGS.includes(value) ? "w-4" : "w-2";
        return (
          <div
            className={`relative h-6 ${widthClassName} bg-primary/10`}
            key={value}
          >
            <div
              className="absolute bottom-0 left-0 w-full bg-primary"
              style={{
                height:
                  maxRating > 0
                    ? `${(ratingDistribution[value] / maxRating) * 100}%`
                    : "0%",
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
