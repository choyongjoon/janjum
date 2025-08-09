interface RatingTextProps {
  rating: number;
  ratingText: string;
  className?: string;
}

function getColorByRating(rating: number) {
  if (rating >= 5) {
    return 'text-primary';
  }
  if (rating >= 4.5) {
    return 'text-primary/90';
  }
  if (rating >= 4) {
    return 'text-primary/80';
  }
  if (rating >= 3.5) {
    return 'text-primary/70';
  }
  if (rating >= 3) {
    return 'text-primary/60';
  }
  return 'text-primary/40';
}

export function RatingText({
  rating,
  ratingText,
  className = '',
}: RatingTextProps) {
  return (
    <span
      className={`font-medium text-sm ${getColorByRating(rating)} ${className}`}
    >
      {ratingText}
    </span>
  );
}
