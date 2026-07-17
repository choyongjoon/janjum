import { RATING_TEXTS, RATING_VALUES } from "shared/ratings";

interface RatingStarsProps {
  onRatingChange?: (rating: number) => void;
  rating: number;
  readonly?: boolean;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}

export function RatingButtonGroup({
  rating,
  onRatingChange,
}: RatingStarsProps) {
  return (
    <div className="join">
      {RATING_VALUES.map((value) => (
        <input
          aria-label={RATING_TEXTS[value]}
          className={`join-item btn w-10 p-0 ${
            rating === value ? "btn-primary" : "btn-outline"
          }`}
          key={value}
          name="options"
          onChange={() => onRatingChange?.(value)}
          type="radio"
        />
      ))}
    </div>
  );
}
