import { convexQuery } from '@convex-dev/react-query';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Doc, Id } from 'convex/_generated/dataModel';

import { RatingText } from './RatingText';

interface MyReview extends Doc<'reviews'> {
  product: Doc<'products'> | null;
  ratingText: string | undefined;
  imageUrls: string[] | undefined;
  text?: string;
}

export function MyReview({ review }: { review: MyReview }) {
  const { data: cafe } = useSuspenseQuery(
    convexQuery(api.cafes.getById, {
      cafeId: review.product?.cafeId as Id<'cafes'>,
    })
  );

  return (
    <div
      className="border-base-200 border-b pb-4 last:border-b-0 last:pb-0"
      key={review._id}
    >
      <Link
        className="link link-neutral"
        params={{ slug: cafe?.slug || '' }}
        to="/cafe/$slug"
      >
        {cafe?.name}
      </Link>
      {/* Product link */}
      {review.product && (
        <div className="mb-3">
          <Link
            className="link"
            params={{ shortId: review.product.shortId }}
            to="/product/$shortId"
          >
            {review.product.name}
          </Link>
        </div>
      )}

      {/* Review content */}
      <div className="pl-0">
        <div className="mb-2">
          <RatingText
            rating={review.rating}
            ratingText={review.ratingText || ''}
          />
        </div>

        {review.text && <p className="mb-3 text-base-content">{review.text}</p>}

        {review.imageUrls && review.imageUrls.length > 0 && (
          <div className="grid max-w-md grid-cols-2 gap-2">
            {review.imageUrls.map((imageUrl, index) => (
              <div
                className="aspect-square overflow-hidden rounded-lg"
                key={`${review._id}-image-${index}`}
              >
                <img
                  alt={`후기 이미지 ${index + 1}`}
                  className="h-full w-full object-cover"
                  src={imageUrl}
                />
              </div>
            ))}
          </div>
        )}

        <p className="text-right text-base-content/60 text-sm">
          {new Date(review.createdAt).toLocaleDateString('ko-KR')}
          {review.updatedAt !== review.createdAt && ' (수정됨)'}
        </p>
      </div>
    </div>
  );
}
