import { useQueries } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  NEW_PRODUCTS_PAGE_SIZE,
  recentProductsPageQueryOptions,
} from "~/components/NewProductsSection";
import { ProductCard } from "~/components/ProductCard";
import { useProductReviewStats } from "~/hooks/useProductReviewStats";
import type { Doc } from "../../convex/_generated/dataModel";
import { seo } from "../utils/seo";

export const Route = createFileRoute("/new")({
  component: NewProductsPage,
  loader: async (opts) => {
    // SSR only the first page; further pages load on demand via "더 보기".
    await opts.context.queryClient.ensureQueryData(
      recentProductsPageQueryOptions(0)
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

function groupByCafe(
  products: ProductWithCafe[]
): { cafeName: string; products: ProductWithCafe[] }[] {
  const groups = new Map<string, ProductWithCafe[]>();

  for (const product of products) {
    const existing = groups.get(product.cafeName);
    if (existing) {
      existing.push(product);
    } else {
      groups.set(product.cafeName, [product]);
    }
  }

  // Sort cafe groups by the most recent product's addedAt (newest first)
  return [...groups.entries()]
    .map(([cafeName, cafeProducts]) => ({ cafeName, products: cafeProducts }))
    .sort(
      (a, b) =>
        (b.products.at(0)?.addedAt ?? 0) - (a.products.at(0)?.addedAt ?? 0)
    );
}

function NewProductsPage() {
  const [pageCount, setPageCount] = useState(1);

  const pageQueries = useQueries({
    queries: Array.from({ length: pageCount }, (_, pageIndex) =>
      recentProductsPageQueryOptions(pageIndex * NEW_PRODUCTS_PAGE_SIZE)
    ),
  });

  const products = pageQueries.flatMap((page) => page.data?.products ?? []);
  const totalCount = pageQueries.at(0)?.data?.totalCount ?? 0;
  const hasMore = products.length < totalCount;
  const isLoadingMore = pageQueries.some((page) => page.isPending);

  const reviewStats = useProductReviewStats(
    products.map((product) => product._id)
  );
  const cafeGroups = groupByCafe(products);

  return (
    <div className="min-h-screen bg-base-200">
      <div className="container mx-auto px-4 py-8">
        <h1 className="mb-8 font-bold text-3xl">
          신상품{" "}
          {totalCount > 0 && (
            <span className="text-base-content/50 text-xl">{totalCount}</span>
          )}
        </h1>

        {cafeGroups.length === 0 && !isLoadingMore && (
          <p className="text-center text-base-content/60">
            최근 30일 이내 신상품이 없습니다.
          </p>
        )}

        {cafeGroups.map(({ cafeName, products: cafeProducts }) => (
          <div className="mb-10" key={cafeName}>
            <h2 className="mb-4 font-bold text-xl">{cafeName}</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {cafeProducts.map((product) => (
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
          </div>
        ))}

        {hasMore && (
          <div className="flex justify-center">
            <button
              className="btn btn-outline btn-wide"
              disabled={isLoadingMore}
              onClick={() => setPageCount((count) => count + 1)}
              type="button"
            >
              {isLoadingMore
                ? "불러오는 중..."
                : `더 보기 (${totalCount - products.length}개 남음)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
