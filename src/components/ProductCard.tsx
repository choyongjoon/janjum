import { convexQuery } from '@convex-dev/react-query';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import { api } from '../../convex/_generated/api';
import type { Doc } from '../../convex/_generated/dataModel';
import { RatingSummary } from '../components/RatingSummary';

export function ProductCard({
  product,
  priority = false,
}: {
  product: Doc<'products'> & {
    cafeName?: string;
    imageUrl?: string;
  };
  priority?: boolean;
}) {
  const { data: reviewStats } = useQuery({
    ...convexQuery(api.reviews.getProductStats, { productId: product._id }),
    enabled: !!product._id,
  });

  const defaultReviewStats = {
    averageRating: 0,
    totalReviews: 0,
    ratingDistribution: {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
      3.5: 0,
      4.5: 0,
    },
  };

  const { isActive } = product;

  return (
    <Link
      className="card bg-base-100 shadow-md transition-shadow hover:shadow-lg"
      key={product._id}
      params={{ shortId: product.shortId }}
      to="/product/$shortId"
    >
      <figure className="">
        <img
          alt={product.name}
          className="aspect-square w-full object-cover"
          height={300}
          loading={priority ? 'eager' : 'lazy'}
          src={product.imageUrl || product.externalImageUrl}
          width={300}
        />
      </figure>
      <div className="card-body overflow-hidden p-2 md:p-4">
        {product.cafeName && (
          <p className="text-base-content/60 text-sm">{product.cafeName}</p>
        )}
        {!isActive && (
          <div className="badge badge-soft badge-warning badge-sm">단종</div>
        )}
        <div className="flex items-start justify-between gap-2">
          <h3
            className={`card-title break-keep ${isActive ? '' : 'text-base-content/50'}`}
          >
            {product.name}
          </h3>
        </div>
        <RatingSummary reviewStats={reviewStats || defaultReviewStats} />
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            {product.price && (
              <p className="font-bold text-lg text-primary">
                {product.price.toLocaleString()}원
              </p>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
