import { useQueries, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  NEW_PRODUCTS_CAFE_PAGE_SIZE,
  NEW_PRODUCTS_PER_CAFE,
  recentCafeProductsPageQueryOptions,
  recentProductsByCafeQueryOptions,
} from "~/components/NewProductsSection";
import { ProductCard } from "~/components/ProductCard";
import { useProductReviewStats } from "~/hooks/useProductReviewStats";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { seo } from "../utils/seo";

export const Route = createFileRoute("/new")({
  component: NewProductsPage,
  loader: async (opts) => {
    // SSR the first products of each cafe; the rest load on demand via "더 보기".
    await opts.context.queryClient.ensureQueryData(
      recentProductsByCafeQueryOptions
    );
  },
  head: () => ({
    meta: [
      ...seo({
        title: "신상품 - 잔점",
        description: "최근 30일 이내에 새로 추가된 카페 음료를 확인하세요.",
        keywords: "신상품, 신메뉴, 카페, 음료, 잔점",
      }),
    ],
  }),
});

type ProductWithCafe = Doc<"products"> & {
  cafeName: string;
  imageUrl?: string;
};

function formatRelativeDate(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return "오늘";
  }
  if (days === 1) {
    return "어제";
  }
  if (days < 7) {
    return `${days}일 전`;
  }
  const weeks = Math.floor(days / 7);
  if (weeks < 5) {
    return `${weeks}주 전`;
  }
  return `${Math.floor(days / 30)}개월 전`;
}

function CafeGroup({
  cafeId,
  cafeName,
  initialProducts,
  totalCount,
}: {
  cafeId: Id<"cafes">;
  cafeName: string;
  initialProducts: ProductWithCafe[];
  totalCount: number;
}) {
  const [extraPageCount, setExtraPageCount] = useState(0);

  const extraPageQueries = useQueries({
    queries: Array.from({ length: extraPageCount }, (_, pageIndex) =>
      recentCafeProductsPageQueryOptions(
        cafeId,
        NEW_PRODUCTS_PER_CAFE + pageIndex * NEW_PRODUCTS_CAFE_PAGE_SIZE
      )
    ),
  });

  const products = [
    ...initialProducts,
    ...extraPageQueries.flatMap((page) => page.data?.products ?? []),
  ];
  const hasMore = products.length < totalCount;
  const isLoadingMore = extraPageQueries.some((page) => page.isPending);

  const reviewStats = useProductReviewStats(
    products.map((product) => product._id)
  );

  return (
    <section className="mb-10">
      <h2 className="mb-4 font-bold text-xl">
        {cafeName}{" "}
        <span className="text-base text-base-content/50">{totalCount}</span>
      </h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {products.map((product) => (
          <div key={product._id}>
            <ProductCard
              product={product}
              reviewStats={reviewStats?.[product._id]}
            />
            <p className="mt-1 text-base-content/50 text-xs">
              {formatRelativeDate(product.addedAt)}
            </p>
          </div>
        ))}
      </div>
      {hasMore && (
        <div className="mt-4 flex justify-center">
          <button
            className="btn btn-outline btn-sm"
            disabled={isLoadingMore}
            onClick={() => setExtraPageCount((count) => count + 1)}
            type="button"
          >
            {isLoadingMore
              ? "불러오는 중..."
              : `더 보기 (${totalCount - products.length}개 남음)`}
          </button>
        </div>
      )}
    </section>
  );
}

function NewProductsPage() {
  const { data, isPending } = useQuery(recentProductsByCafeQueryOptions);
  const cafes = data?.cafes ?? [];
  const totalCount = data?.totalCount ?? 0;

  return (
    <div className="min-h-screen bg-base-200">
      <div className="container mx-auto px-4 py-8">
        <h1 className="mb-8 font-bold text-3xl">
          신상품{" "}
          {totalCount > 0 && (
            <span className="text-base-content/50 text-xl">{totalCount}</span>
          )}
        </h1>

        {cafes.length === 0 && !isPending && (
          <p className="text-center text-base-content/60">
            최근 30일 이내 신상품이 없습니다.
          </p>
        )}

        {cafes.map((cafe) => (
          <CafeGroup
            cafeId={cafe.cafeId}
            cafeName={cafe.cafeName}
            initialProducts={cafe.products}
            key={cafe.cafeId}
            totalCount={cafe.totalCount}
          />
        ))}
      </div>
    </div>
  );
}
