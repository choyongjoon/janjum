import { convexQuery } from '@convex-dev/react-query';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import type { Id } from 'convex/_generated/dataModel';
import { z } from 'zod';
import CafeHeader from '~/components/cafe/CafeHeader';
import { api } from '../../convex/_generated/api';
import { ProductCard } from '../components/ProductCard';
import { getOrderedCategories } from '../utils/categories';
import { seo } from '../utils/seo';

const searchSchema = z.object({
  category: z.string().optional(),
});

export const Route = createFileRoute('/cafe/$slug')({
  component: CafePage,
  validateSearch: searchSchema,
  loader: async (opts) => {
    const cafe = await opts.context.queryClient.ensureQueryData(
      convexQuery(api.cafes.getBySlug, { slug: opts.params.slug })
    );
    return { cafe };
  },
  head: ({ loaderData }) => ({
    meta: [
      ...seo({
        title: `잔점 | ${loaderData?.cafe?.name || '카페'}`,
        description: `${loaderData?.cafe?.name || '카페'} 음료 정보를 확인하세요.`,
      }),
    ],
  }),
});

function CafePage() {
  const { slug } = Route.useParams();
  const { data: cafe } = useSuspenseQuery(
    convexQuery(api.cafes.getBySlug, { slug })
  );

  const { category: selectedCategory } = Route.useSearch();
  const navigate = useNavigate();

  const { data: products, isLoading: productsLoading } = useQuery({
    ...convexQuery(api.products.getByCafe, {
      cafeId: cafe?._id as Id<'cafes'>,
    }),
    enabled: !!cafe?._id,
  });

  const availableCategories = Array.from(
    new Set(products?.map((p) => p.category).filter(Boolean) || [])
  );
  const categories = getOrderedCategories(availableCategories as string[]);
  const filteredProducts =
    selectedCategory === undefined
      ? products
      : products?.filter((p) => p.category === selectedCategory);

  const handleCategoryChange = (newCategory: string) => {
    if (!cafe) {
      return;
    }

    navigate({
      to: '/cafe/$slug',
      params: { slug: cafe.slug },
      search: {
        category: newCategory === '전체' ? undefined : newCategory,
      },
      replace: true,
    });
  };

  if (!cafe) {
    return null;
  }

  return (
    <div className="min-h-screen bg-base-200">
      {/* Cafe Header */}
      <CafeHeader cafe={cafe} numProducts={products?.length} />

      <div className="container mx-auto px-4 py-8">
        {/* Category Filter */}
        <div className="mb-8">
          <h2 className="mb-4 font-semibold text-xl">카테고리</h2>
          <div className="flex flex-wrap gap-2">
            <button
              className={`btn btn-sm ${selectedCategory === undefined ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => handleCategoryChange('전체')}
              type="button"
            >
              전체
            </button>
            {productsLoading
              ? // Category loading skeleton
                Array.from({ length: 4 }, (_, i) => (
                  <div
                    className="h-8 w-16 animate-pulse rounded bg-base-300"
                    key={`category-skeleton-${
                      // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
                      i
                    }`}
                  />
                ))
              : categories.map((category) => (
                  <button
                    className={`btn btn-sm ${selectedCategory === category ? 'btn-primary' : 'btn-outline'}`}
                    key={category}
                    onClick={() => handleCategoryChange(category)}
                    type="button"
                  >
                    {category}
                  </button>
                ))}
          </div>
        </div>

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
            : filteredProducts?.map((product) => (
                <ProductCard key={product._id} product={product} />
              ))}
        </div>

        {!productsLoading && filteredProducts?.length === 0 && (
          <div className="py-12 text-center">
            <p className="text-base-content/70">상품이 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
