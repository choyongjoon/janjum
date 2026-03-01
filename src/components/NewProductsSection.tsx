import { convexQuery } from '@convex-dev/react-query';
import { useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { api } from '../../convex/_generated/api';
import { ProductCard } from './ProductCard';

const STALE_TIME = 60 * 60 * 1000; // 1 hour

export const recentProductsQueryOptions = {
  ...convexQuery(api.products.getRecent, { limit: 4 }),
  staleTime: STALE_TIME,
};

export const recentProductsAllQueryOptions = {
  ...convexQuery(api.products.getRecent, {}),
  staleTime: STALE_TIME,
};

export function NewProductsSection() {
  const { data } = useSuspenseQuery(recentProductsQueryOptions);

  if (data.products.length === 0) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-bold text-3xl">
          신상품{' '}
          <span className="text-base-content/50 text-xl">
            {data.totalCount}
          </span>
        </h2>
        <Link className="btn btn-ghost btn-sm" to="/new">
          전체 보기
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {data.products.map((product) => (
          <ProductCard key={product._id} product={product} />
        ))}
      </div>
    </div>
  );
}
