import { convexQuery } from '@convex-dev/react-query';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';

import { api } from '../../convex/_generated/api';
import type { Doc } from '../../convex/_generated/dataModel';
import { ConvexImage } from '../components/ConvexImage';
import { RatingSummary } from '../components/RatingSummary';

export function ProductCard({
  product,
}: {
  product: Doc<'products'> & { cafeName?: string };
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

  return (
    <Link
      className="card bg-base-100 shadow-md transition-shadow hover:shadow-lg"
      key={product._id}
      params={{ shortId: product.shortId }}
      to="/product/$shortId"
    >
      <figure className="">
        <ConvexImage
          alt={product.name}
          className="aspect-square w-full object-cover"
          fallbackImageUrl={product.externalImageUrl}
          getImageUrl={api.products.getImageUrl}
          imageStorageId={product.imageStorageId}
        />
      </figure>
      <div className="card-body overflow-hidden p-2 md:p-4">
        {product.cafeName && (
          <p className="text-base-content/60 text-sm">{product.cafeName}</p>
        )}
        <h3 className="card-title break-keep">{product.name}</h3>
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
