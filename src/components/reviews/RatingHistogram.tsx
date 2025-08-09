import type { RatingDistribution } from 'convex/reviews';

export const RATING_CONFIG = [
  { value: 1, label: '최악' },
  { value: 2, label: '별로' },
  { value: 3, label: '보통' },
  { value: 3.5, label: '좋음' },
  { value: 4, label: '추천' },
  { value: 4.5, label: '강력 추천' },
  { value: 5, label: '최고' },
] as const;

interface RatingHistogramProps {
  ratingDistribution: RatingDistribution;
}

export function RatingHistogram({ ratingDistribution }: RatingHistogramProps) {
  const maxRating = Math.max(...Object.values(ratingDistribution));

  return (
    <div className="flex items-end">
      {RATING_CONFIG.map((r) => {
        let widthClassName = 'w-2';
        if ([1, 2, 5].includes(r.value)) {
          widthClassName = 'w-4';
        }
        return (
          <div
            className={`relative h-6 ${widthClassName} bg-primary/10`}
            key={r.value}
          >
            <div
              className={'absolute bottom-0 left-0 w-full bg-primary'}
              style={{
                height:
                  maxRating > 0
                    ? `${(ratingDistribution[r.value] / maxRating) * 100}%`
                    : '0%',
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
