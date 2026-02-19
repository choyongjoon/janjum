import { convexQuery } from '@convex-dev/react-query';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Doc, Id } from 'convex/_generated/dataModel';
import { showToast } from '../../utils/toast';

import { RatingText } from './RatingText';

export interface Review extends Doc<'reviews'> {
  product: Doc<'products'> | null;
  ratingText: string | undefined;
  imageUrls: string[] | undefined;
}

export function ReviewInUserPage({ review }: { review: Review }) {
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
        <div className="mb-2 flex items-center justify-between">
          <RatingText
            rating={review.rating}
            ratingText={review.ratingText || ''}
          />
          <button
            className="btn btn-ghost btn-circle btn-xs"
            onClick={() => {
              const reviewUrl = `${window.location.origin}/review/${review._id}`;
              navigator.clipboard
                .writeText(reviewUrl)
                .then(() => {
                  showToast('후기 링크가 복사되었습니다!', 'success');
                })
                .catch(() => {
                  showToast('링크 복사에 실패했습니다.', 'error');
                });
            }}
            title="후기 링크 복사"
            type="button"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <title>Share review</title>
              <path
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
              />
            </svg>
          </button>
        </div>

        {review.text && <p className="mb-3 text-base-content">{review.text}</p>}

        {review.imageUrls && review.imageUrls.length > 0 && (
          <div className="grid max-w-md grid-cols-2 gap-2">
            {review.imageUrls.map((imageUrl, index) => (
              <div
                className="aspect-square overflow-hidden rounded-lg"
                key={imageUrl}
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

        <div className="text-right text-base-content/60 text-sm">
          <Link
            className="link link-hover"
            params={{ reviewId: review._id }}
            to="/review/$reviewId"
          >
            {new Date(review.createdAt).toLocaleDateString('ko-KR')}
            {review.updatedAt !== review.createdAt && ' (수정됨)'}
          </Link>
        </div>
      </div>
    </div>
  );
}
