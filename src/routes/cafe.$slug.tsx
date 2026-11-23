import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import type { Id } from "convex/_generated/dataModel";
import { useMemo, useState } from "react";
import { z } from "zod";
import CafeHeader from "~/components/cafe/CafeHeader";
import { CategoryFilter } from "~/components/cafe/CategoryFilter";
import {
  type OrderOption,
  OrderSelector,
} from "~/components/cafe/OrderSelector";
import { ProductSearchInput } from "~/components/cafe/ProductSearchInput";
import { useProductReviewStats } from "~/hooks/useProductReviewStats";
import { staticConvexQuery } from "~/utils/staticConvexQuery";
import { api } from "../../convex/_generated/api";
import { CafeNotFound } from "../components/cafe/CafeNotFound";
import { JsonLd } from "../components/JsonLd";
import { ProductCard } from "../components/ProductCard";
import { getOrderedCategories } from "../utils/categories";
import { canonicalLink, DEFAULT_OG_IMAGE, seo } from "../utils/seo";
import { cafeDescription, cafeTitle } from "../utils/seoDescriptions";
import { cafeJsonLd } from "../utils/structuredData";

const searchSchema = z.object({
  category: z.string().optional(),
  // No .default(): a default makes the router redirect /cafe/x to
  // /cafe/x?order=latest, so crawlers never see the canonical URL.
  order: z.enum(["latest", "most-reviews", "highest-rating"]).optional(),
});

export const Route = createFileRoute("/cafe/$slug")({
  component: CafePage,
  validateSearch: searchSchema,
  loader: async (opts) => {
    const cafe = await opts.context.queryClient.ensureQueryData(
      staticConvexQuery(api.cafes.getBySlug, { slug: opts.params.slug })
    );
    if (!cafe) {
      throw notFound();
    }
    // Prefetch the menu so the product grid (and its links to every product
    // page) is in the server-rendered HTML that search crawlers read.
    const products = await opts.context.queryClient.ensureQueryData(
      staticConvexQuery(api.products.getByCafe, { cafeId: cafe._id })
    );
    return {
      cafe,
      productCount: products.length,
      description: cafeDescription(cafe.name, products),
    };
  },
  head: ({ loaderData }) => ({
    meta: [
      ...seo({
        title: cafeTitle(loaderData?.cafe?.name || "카페"),
        description: loaderData?.description,
        image: loaderData?.cafe?.imageUrl || DEFAULT_OG_IMAGE,
        path: `/cafe/${loaderData?.cafe?.slug}`,
      }),
    ],
    // Category/order query params are views of the same page.
    links: loaderData?.cafe
      ? canonicalLink(`/cafe/${loaderData.cafe.slug}`)
      : [],
  }),
  notFoundComponent: CafeNotFound,
});

function CafePage() {
  const { slug } = Route.useParams();
  const { data: cafe } = useSuspenseQuery(
    staticConvexQuery(api.cafes.getBySlug, { slug })
  );

  const { category: selectedCategory, order: selectedOrder = "latest" } =
    Route.useSearch();
  const navigate = useNavigate();

  const { data: products, isLoading: productsLoading } = useQuery({
    ...staticConvexQuery(api.products.getByCafe, {
      cafeId: cafe?._id as Id<"cafes">,
    }),
    enabled: !!cafe?._id,
  });

  const [searchQuery, setSearchQuery] = useState("");

  const reviewStats = useProductReviewStats(
    products?.map((product) => product._id) ?? []
  );

  const availableCategories = Array.from(
    new Set(products?.map((p) => p.category).filter(Boolean) || [])
  );
  const categories = getOrderedCategories(availableCategories as string[]);

  const filteredProducts = useMemo(() => {
    let result =
      selectedCategory === undefined
        ? products
        : products?.filter((p) => p.category === selectedCategory);

    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      result = result?.filter((p) => p.name.toLowerCase().includes(query));
    }

    return result;
  }, [products, selectedCategory, searchQuery]);

  const sortedProducts = (() => {
    if (!filteredProducts) {
      return;
    }
    const sorted = [...filteredProducts];
    switch (selectedOrder) {
      case "most-reviews":
        return sorted.sort(
          (a, b) => (b.totalReviews ?? 0) - (a.totalReviews ?? 0)
        );
      case "highest-rating":
        return sorted.sort(
          (a, b) => (b.averageRating ?? 0) - (a.averageRating ?? 0)
        );
      default:
        return sorted;
    }
  })();

  const handleCategoryChange = (newCategory: string) => {
    if (!cafe) {
      return;
    }

    navigate({
      to: "/cafe/$slug",
      params: { slug: cafe.slug },
      search: (prev) => ({
        ...prev,
        category: newCategory === "전체" ? undefined : newCategory,
      }),
      replace: true,
    });
  };

  const handleOrderChange = (newOrder: OrderOption) => {
    if (!cafe) {
      return;
    }

    navigate({
      to: "/cafe/$slug",
      params: { slug: cafe.slug },
      search: (prev) => ({
        ...prev,
        order: newOrder === "latest" ? undefined : newOrder,
      }),
      replace: true,
    });
  };

  if (!cafe) {
    return null;
  }

  return (
    <div className="min-h-screen bg-base-200">
      <JsonLd data={cafeJsonLd(cafe, products?.length ?? 0)} />
      {/* Cafe Header */}
      <CafeHeader cafe={cafe} numProducts={products?.length} />

      <div className="container mx-auto px-4 py-8">
        <div className="mb-6 flex items-center gap-2">
          <ProductSearchInput onChange={setSearchQuery} value={searchQuery} />
          <OrderSelector onChange={handleOrderChange} value={selectedOrder} />
        </div>

        <CategoryFilter
          categories={categories}
          isLoading={productsLoading}
          onCategoryChange={handleCategoryChange}
          selectedCategory={selectedCategory}
        />

        {/* Products Grid */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {productsLoading
            ? // Loading skeleton for products
              Array.from({ length: 8 }, (_, i) => (
                <div
                  className="card bg-base-100 shadow-sm"
                  key={`product-skeleton-${
                    // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
                    i
                  }`}
                >
                  <div className="aspect-square w-full animate-pulse bg-base-300" />
                  <div className="card-body p-4">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-base-300" />
                    <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-base-300" />
                    <div className="mt-2 h-6 w-16 animate-pulse rounded bg-base-300" />
                  </div>
                </div>
              ))
            : sortedProducts?.map((product, index) => (
                <ProductCard
                  key={product._id}
                  priority={index < 8}
                  product={product}
                  reviewStats={reviewStats?.[product._id]}
                />
              ))}
        </div>

        {!productsLoading && sortedProducts?.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-base-content/70">
              {searchQuery.trim()
                ? `"${searchQuery.trim()}"에 대한 검색 결과가 없습니다.`
                : "상품이 없습니다."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
