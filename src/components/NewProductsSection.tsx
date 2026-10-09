import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useProductReviewStats } from "../hooks/useProductReviewStats";
import { ProductCard } from "./ProductCard";

const STALE_TIME = 60 * 60 * 1000; // 1 hour

export const recentProductsQueryOptions = {
  ...convexQuery(api.products.getRecent, { limit: 4 }),
  staleTime: STALE_TIME,
};

export const NEW_PRODUCTS_PER_CAFE = 4;

export const recentProductsByCafeQueryOptions = {
  ...convexQuery(api.products.getRecentByCafe, {
    perCafe: NEW_PRODUCTS_PER_CAFE,
  }),
  staleTime: STALE_TIME,
};

export const NEW_PRODUCTS_CAFE_PAGE_SIZE = 8;

export const recentCafeProductsPageQueryOptions = (
  cafeId: Id<"cafes">,
  offset: number
) => ({
  ...convexQuery(api.products.getRecent, {
    cafeId,
    limit: NEW_PRODUCTS_CAFE_PAGE_SIZE,
    offset,
  }),
  staleTime: STALE_TIME,
});

export function NewProductsSection() {
  const { data } = useSuspenseQuery(recentProductsQueryOptions);
  const reviewStats = useProductReviewStats(
    data.products.map((product) => product._id)
  );

  if (data.products.length === 0) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="font-bold text-3xl">
          신상품{" "}
          <span className="text-base-content/50 text-xl">
            {data.totalCount}
          </span>
        </h2>
        <Link className="btn btn-ghost btn-sm" to="/new">
          전체 보기
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {data.products.map((product, index) => (
          <ProductCard
            fetchPriority={index === 0 ? "high" : "auto"}
            key={product._id}
            priority
            product={product}
            reviewStats={reviewStats?.[product._id]}
          />
        ))}
      </div>
    </div>
  );
}
