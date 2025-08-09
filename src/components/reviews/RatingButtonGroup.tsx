const RATING_CONFIG = [
  { value: 1, label: '최악', color: 'text-red-500' },
  { value: 2, label: '별로', color: 'text-orange-400' },
  { value: 3, label: '보통', color: 'text-yellow-400' },
  { value: 3.5, label: '좋음', color: 'text-yellow-300' },
  { value: 4, label: '추천', color: 'text-green-400' },
  { value: 4.5, label: '강력 추천', color: 'text-green-300' },
  { value: 5, label: '최고', color: 'text-emerald-400' },
];

interface RatingStarsProps {
  rating: number;
  onRatingChange?: (rating: number) => void;
  readonly?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function RatingButtonGroup({
  rating,
  onRatingChange,
}: RatingStarsProps) {
  return (
    <div className="join">
      {RATING_CONFIG.map((r) => (
        <input
          aria-label={r.label}
          className={`join-item btn w-10 p-0 ${
            rating === r.value ? 'btn-primary' : 'btn-outline'
          }`}
          key={r.value}
          name="options"
          onChange={() => onRatingChange?.(r.value)}
          type="radio"
        />
      ))}
    </div>
  );
}
