import { convexQuery } from '@convex-dev/react-query';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { Id } from 'convex/_generated/dataModel';
import { RatingSummary } from '~/components/RatingSummary';
import { api } from '../../convex/_generated/api';
import { BackLink } from '../components/BackLink';
import { ExternalLinkIcon } from '../components/icons';
import { ProductCard } from '../components/ProductCard';
import { ReviewSection } from '../components/reviews/ReviewSection';

export const Route = createFileRoute('/product/$shortId')({
  component: ProductPage,
  loader: async (opts) => {
    const product = await opts.context.queryClient.ensureQueryData(
      convexQuery(api.products.getByShortId, {
        shortId: opts.params.shortId,
      })
    );
    await opts.context.queryClient.ensureQueryData(
      convexQuery(api.cafes.getById, {
        cafeId: product?.cafeId as Id<'cafes'>,
      })
    );
  },
});

function ProductPage() {
  const { shortId } = Route.useParams();

  const { data: product } = useSuspenseQuery(
    convexQuery(api.products.getByShortId, {
      shortId,
    })
  );

  const { data: cafe } = useSuspenseQuery(
    convexQuery(api.cafes.getById, { cafeId: product?.cafeId as Id<'cafes'> })
  );

  const { data: reviewStats } = useSuspenseQuery(
    convexQuery(api.reviews.getProductStats, {
      productId: product?._id as Id<'products'>,
    })
  );

  if (!product) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-base-200">
        <div className="text-center">
          <h1 className="mb-4 font-bold text-2xl">상품을 찾을 수 없습니다</h1>
          <Link className="btn btn-primary" to="/">
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-200">
      {/* Product Details */}
      <div className="container mx-auto px-4 py-8">
        {/* Back Link */}
        {cafe && <BackLink to={`/cafe/${cafe.slug}`}>{cafe.name}</BackLink>}
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Product Image */}
          <div className="flex justify-center">
            <div className="w-full max-w-md">
              <img
                alt={product.name}
                className="aspect-square w-full object-cover"
                loading="lazy"
                src={product.imageUrl || product.externalImageUrl}
              />
            </div>
          </div>

          {/* Product Information */}
          <div className="space-y-6">
            <div>
              <h1 className="mb-2 font-bold text-3xl">{product.name}</h1>
              {product.nameEn && (
                <p className="mb-4 text-base-content/70 text-lg">
                  {product.nameEn}
                </p>
              )}

              {/* Category Badge */}
              {product.category && (
                <div className="flex items-center gap-2">
                  <div className="badge badge-neutral badge-lg">
                    {product.category}
                  </div>
                  <div className="badge badge-neutral badge-lg">
                    {product.externalCategory}
                  </div>
                </div>
              )}

              {/* Rating Display */}
              <RatingSummary className="mt-4" reviewStats={reviewStats} />
            </div>

            {/* Price */}
            {product.price && (
              <div className="card border border-primary/20 bg-primary/10">
                <div className="card-body">
                  <h3 className="card-title text-primary">가격</h3>
                  <p className="font-bold text-2xl text-primary">
                    {product.price.toLocaleString()}원
                  </p>
                </div>
              </div>
            )}

            {/* Description */}
            {product.description && (
              <p className="whitespace-pre-wrap text-base-content/80">
                {product.description}
              </p>
            )}

            {/* Product Metadata */}

            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-base-content/60">등록일:</span>
                <span>
                  {new Date(product.addedAt).toLocaleDateString('ko-KR')}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-base-content/60">최종 업데이트:</span>
                <span>
                  {new Date(product.updatedAt).toLocaleDateString('ko-KR')}
                </span>
              </div>

              {product.removedAt && (
                <div className="flex justify-between">
                  <span className="text-base-content/60">단종일:</span>
                  <span>
                    {new Date(product.removedAt).toLocaleDateString('ko-KR')}
                  </span>
                </div>
              )}
            </div>

            {/* External Link */}
            {product.externalUrl && (
              <div className="flex gap-4">
                <a
                  className="btn btn-primary btn-block"
                  href={product.externalUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  공식 사이트에서 보기
                  <ExternalLinkIcon />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Reviews Section */}
        <div className="mt-16">
          <div className="divider">
            <h2 className="font-bold text-2xl">후기</h2>
          </div>
          <ReviewSection productId={product._id} />
        </div>

        {/* Related Products */}
        {cafe && (
          <div className="mt-16">
            <div className="divider">
              <h2 className="font-bold text-2xl">같은 카페의 다른 상품</h2>
            </div>
            <RelatedProducts
              cafeId={product.cafeId}
              currentProductId={product._id}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function RelatedProducts({
  cafeId,
  currentProductId,
}: {
  cafeId: Id<'cafes'>;
  currentProductId: Id<'products'>;
}) {
  const { data: products } = useSuspenseQuery(
    convexQuery(api.products.getByCafe, { cafeId })
  );

  const relatedProducts = products
    ?.filter((p) => p._id !== currentProductId && p.isActive)
    ?.slice(0, 8);

  if (!relatedProducts || relatedProducts.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-base-content/60">관련 상품이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
      {relatedProducts.map((product) => (
        <ProductCard key={product._id} product={product} />
      ))}
    </div>
  );
}
