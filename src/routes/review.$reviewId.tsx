import { convexQuery } from '@convex-dev/react-query';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import type { Id } from 'convex/_generated/dataModel';
import { api } from '../../convex/_generated/api';
import { ReviewCard } from '../components/reviews/ReviewCard';
import { seo } from '../utils/seo';

export const Route = createFileRoute('/review/$reviewId')({
  component: ReviewPage,
  loader: async (opts) => {
    const review = await opts.context.queryClient.ensureQueryData(
      convexQuery(api.reviews.getById, {
        reviewId: opts.params.reviewId as Id<'reviews'>,
      })
    );

    // If review not found, redirect to home
    if (!review) {
      throw redirect({
        to: '/',
      });
    }

    return review;
  },
  head: ({ loaderData }) => ({
    meta: [
      ...seo({
        title: `${loaderData?.user?.name || '익명 사용자'}님의 후기 | 잔점`,
        description:
          loaderData?.text ||
          `${loaderData?.product?.name || '상품'}에 대한 후기입니다.`,
        image:
          loaderData?.product?.externalImageUrl ||
          '/android-chrome-512x512.png',
      }),
    ],
  }),
});

function ReviewPage() {
  const { reviewId } = Route.useParams();

  const { data: review } = useSuspenseQuery(
    convexQuery(api.reviews.getById, {
      reviewId: reviewId as Id<'reviews'>,
    })
  );

  if (!review) {
    return (
      <div className="flex items-center justify-center bg-base-200">
        <div className="text-center">
          <h1 className="mb-4 font-bold text-2xl">후기를 찾을 수 없습니다</h1>
          <Link className="btn btn-primary" to="/">
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-base-200">
      <div className="container mx-auto px-4 py-8">
        {/* Product Information at the top */}
        <div className="mx-auto mb-8 max-w-2xl">
          <div className="flex items-start gap-4">
            {/* Product Image - Half size */}
            <div className="w-32 flex-shrink-0">
              <img
                alt={review.product.name}
                className="aspect-square w-full rounded-lg object-cover shadow-md"
                src={review.product.externalImageUrl}
              />
            </div>

            {/* Cafe and Product Names */}
            <div className="flex-1">
              {review.cafe?.slug && (
                <div className="mb-2">
                  <Link
                    className="hover:link font-medium text-base-content/70 text-lg"
                    params={{ slug: review.cafe.slug }}
                    to="/cafe/$slug"
                  >
                    {review.cafe.name}
                  </Link>
                </div>
              )}
              <h1 className="font-bold text-2xl">{review.product.name}</h1>
            </div>
          </div>
        </div>

        {/* Review Card */}
        <div className="mx-auto mb-8 max-w-2xl">
          <ReviewCard review={review} />
        </div>

        {/* Button to Product Page */}
        <div className="mx-auto max-w-2xl text-center">
          <Link
            className="btn btn-primary"
            params={{ shortId: review.product.shortId }}
            to="/product/$shortId"
          >
            상품 페이지에서 더 많은 후기 보기
          </Link>
        </div>
      </div>
    </div>
  );
}
