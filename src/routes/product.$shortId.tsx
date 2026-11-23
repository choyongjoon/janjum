import { convexQuery } from "@convex-dev/react-query";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import type { Id } from "convex/_generated/dataModel";
import { NutritionInfoSection } from "~/components/NutritionInfoSection";
import { RatingSummary } from "~/components/RatingSummary";
import { staticConvexQuery } from "~/utils/staticConvexQuery";
import { api } from "../../convex/_generated/api";
import { BackLink } from "../components/BackLink";
import { ExternalLinkIcon } from "../components/icons/ExternalLinkIcon";
import { JsonLd } from "../components/JsonLd";
import { ReviewSection } from "../components/reviews/ReviewSection";
import { canonicalLink, DEFAULT_OG_IMAGE, seo } from "../utils/seo";
import { productDescription, productTitle } from "../utils/seoDescriptions";
import { productJsonLd } from "../utils/structuredData";

const canonicalShortId = (
  product: { shortId: string; canonicalShortId?: string } | null | undefined
) => product?.canonicalShortId ?? product?.shortId;

export const Route = createFileRoute("/product/$shortId")({
  component: ProductPage,
  loader: async (opts) => {
    const product = await opts.context.queryClient.ensureQueryData(
      staticConvexQuery(api.products.getByShortId, {
        shortId: opts.params.shortId,
      })
    );
    if (!product) {
      throw notFound();
    }
    const cafe = await opts.context.queryClient.ensureQueryData(
      staticConvexQuery(api.cafes.getById, { cafeId: product.cafeId })
    );
    return { product, cafe };
  },
  head: ({ loaderData }) => ({
    meta: [
      ...seo({
        title: productTitle(
          loaderData?.product?.name || "상품",
          loaderData?.cafe?.name
        ),
        description: loaderData?.product
          ? productDescription(loaderData.product, loaderData.cafe?.name)
          : undefined,
        image:
          loaderData?.product?.imageUrl ||
          loaderData?.product?.externalImageUrl ||
          DEFAULT_OG_IMAGE,
        path: `/product/${canonicalShortId(loaderData?.product)}`,
      }),
    ],
    // A discontinued duplicate of an active drink points at the active page.
    links: loaderData?.product
      ? canonicalLink(`/product/${canonicalShortId(loaderData.product)}`)
      : [],
  }),
  notFoundComponent: ProductNotFound,
});

function ProductNotFound() {
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

function ProductPage() {
  const { shortId } = Route.useParams();

  const { data: product } = useSuspenseQuery(
    staticConvexQuery(api.products.getByShortId, {
      shortId,
    })
  );

  const { data: cafe } = useSuspenseQuery(
    staticConvexQuery(api.cafes.getById, {
      cafeId: product?.cafeId as Id<"cafes">,
    })
  );

  // Reviews change between syncs, so they stay out of the CDN-cached HTML:
  // fetched in the browser and kept live through a Convex subscription.
  const { data: reviewStats } = useQuery({
    ...convexQuery(api.reviews.getProductStats, {
      productId: product?._id as Id<"products">,
    }),
    enabled: Boolean(product?._id),
  });

  if (!product) {
    return <ProductNotFound />;
  }

  const { isActive } = product;

  return (
    <div className="min-h-screen bg-base-200">
      <JsonLd data={productJsonLd(product, cafe)} />
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
                height={448}
                loading="eager"
                src={product.imageUrl || product.externalImageUrl}
                width={448}
              />
            </div>
          </div>

          {/* Product Information */}
          <div className="space-y-6">
            <div>
              <div className="mb-2 flex items-start justify-between gap-4">
                <h1
                  className={`break-keep font-bold text-3xl ${isActive ? "" : "text-base-content/50"}`}
                >
                  {product.name}
                </h1>
                {!isActive && (
                  <div className="badge badge-soft badge-warning badge-lg shrink-0">
                    단종
                  </div>
                )}
              </div>
              {product.canonicalShortId &&
                product.canonicalShortId !== product.shortId && (
                  <Link
                    className="link link-primary mb-2 inline-block"
                    params={{ shortId: product.canonicalShortId }}
                    to="/product/$shortId"
                  >
                    현재 판매 중인 메뉴 보기
                  </Link>
                )}
              {product.nameEn && (
                <p className="mb-4 text-base-content/70 text-lg">
                  {product.nameEn}
                </p>
              )}
              {/* Rating Display */}
              {reviewStats ? (
                <RatingSummary className="mt-4" reviewStats={reviewStats} />
              ) : (
                <div aria-hidden="true" className="skeleton mt-4 h-6 w-32" />
              )}
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
              <p className="whitespace-pre-wrap break-keep text-base-content/80">
                {product.description}
              </p>
            )}

            {/* Nutrition Information Section */}
            <NutritionInfoSection nutritions={product.nutritions} />

            {/* Product Metadata */}

            <div className="space-y-2 text-right text-sm">
              <div>
                <span className="text-base-content/60">등록일: </span>
                <span className="inline-block w-21">
                  {new Date(product.addedAt).toLocaleDateString("ko-KR")}
                </span>
              </div>
              <div>
                <span className="text-base-content/60">최종 수정일: </span>
                <span className="inline-block w-21">
                  {new Date(product.updatedAt).toLocaleDateString("ko-KR")}
                </span>
              </div>
              {product.removedAt && (
                <div>
                  <span className="text-base-content/60">단종일: </span>
                  <span className="inline-block w-21">
                    {new Date(product.removedAt).toLocaleDateString("ko-KR")}
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
          <div className="divider" />
          <ReviewSection productId={product._id} />
        </div>
      </div>
    </div>
  );
}
