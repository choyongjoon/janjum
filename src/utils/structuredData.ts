import type { Doc } from "../../convex/_generated/dataModel";
import type { BlogPost } from "./blogData";
import { absoluteUrl, DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL } from "./seo";

type JsonLd = Record<string, unknown>;

type ProductForJsonLd = Pick<
  Doc<"products">,
  | "name"
  | "nameEn"
  | "shortId"
  | "category"
  | "description"
  | "price"
  | "nutritions"
  | "isActive"
  | "averageRating"
  | "totalReviews"
  | "externalImageUrl"
  | "addedAt"
> & { imageUrl?: string | null };

type CafeForJsonLd = Pick<Doc<"cafes">, "name" | "slug"> & {
  imageUrl?: string | null;
};

const LESS_THAN_PATTERN = /</g;

/**
 * A `<script type="application/ld+json">` entry for a route's `head().scripts`.
 * `<` is escaped so text from crawled menus can't close the script tag early.
 */
export const jsonLdScript = (data: JsonLd) => ({
  type: "application/ld+json",
  children: JSON.stringify(data).replace(LESS_THAN_PATTERN, "\\u003c"),
});

const organization = {
  "@type": "Organization",
  "@id": `${SITE_URL}/#organization`,
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  logo: absoluteUrl(DEFAULT_OG_IMAGE),
  email: "contact@janjum.com",
};

export const websiteJsonLd = (): JsonLd => ({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      alternateName: "Janjum",
      url: `${SITE_URL}/`,
      inLanguage: "ko-KR",
      description:
        "스타벅스, 메가커피 등 프랜차이즈 카페 음료의 가격, 칼로리, 카페인 등 영양 정보와 후기를 한곳에서 비교하세요.",
      publisher: { "@id": organization["@id"] },
    },
    organization,
  ],
});

const breadcrumbList = (items: { name: string; path: string }[]) => ({
  "@type": "BreadcrumbList",
  itemListElement: items.map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: item.name,
    item: absoluteUrl(item.path),
  })),
});

export const cafeJsonLd = (
  cafe: CafeForJsonLd,
  productCount: number
): JsonLd => {
  const path = `/cafe/${cafe.slug}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        name: `${cafe.name} 메뉴`,
        url: absoluteUrl(path),
        inLanguage: "ko-KR",
        isPartOf: { "@id": `${SITE_URL}/#website` },
        about: {
          "@type": "Brand",
          name: cafe.name,
          ...(cafe.imageUrl ? { logo: cafe.imageUrl } : {}),
        },
        ...(productCount > 0 ? { numberOfItems: productCount } : {}),
      },
      breadcrumbList([
        { name: SITE_NAME, path: "/" },
        { name: cafe.name, path },
      ]),
    ],
  };
};

const NUTRITION_PROPERTIES: {
  key: keyof NonNullable<ProductForJsonLd["nutritions"]>;
  unitKey: keyof NonNullable<ProductForJsonLd["nutritions"]>;
  name: string;
  defaultUnit: string;
}[] = [
  {
    key: "servingSize",
    unitKey: "servingSizeUnit",
    name: "제공량",
    defaultUnit: "ml",
  },
  {
    key: "calories",
    unitKey: "caloriesUnit",
    name: "열량",
    defaultUnit: "kcal",
  },
  {
    key: "caffeine",
    unitKey: "caffeineUnit",
    name: "카페인",
    defaultUnit: "mg",
  },
  { key: "sugar", unitKey: "sugarUnit", name: "당류", defaultUnit: "g" },
  {
    key: "carbohydrates",
    unitKey: "carbohydratesUnit",
    name: "탄수화물",
    defaultUnit: "g",
  },
  { key: "protein", unitKey: "proteinUnit", name: "단백질", defaultUnit: "g" },
  { key: "fat", unitKey: "fatUnit", name: "지방", defaultUnit: "g" },
  {
    key: "saturatedFat",
    unitKey: "saturatedFatUnit",
    name: "포화지방",
    defaultUnit: "g",
  },
  {
    key: "transFat",
    unitKey: "transFatUnit",
    name: "트랜스지방",
    defaultUnit: "g",
  },
  {
    key: "natrium",
    unitKey: "natriumUnit",
    name: "나트륨",
    defaultUnit: "mg",
  },
  {
    key: "cholesterol",
    unitKey: "cholesterolUnit",
    name: "콜레스테롤",
    defaultUnit: "mg",
  },
];

const nutritionProperties = (nutritions: ProductForJsonLd["nutritions"]) => {
  if (!nutritions) {
    return [];
  }
  return NUTRITION_PROPERTIES.flatMap(({ key, unitKey, name, defaultUnit }) => {
    const value = nutritions[key];
    if (typeof value !== "number") {
      return [];
    }
    const unit = nutritions[unitKey];
    return [
      {
        "@type": "PropertyValue",
        name,
        value,
        unitText: typeof unit === "string" && unit ? unit : defaultUnit,
      },
    ];
  });
};

export const productJsonLd = (
  product: ProductForJsonLd,
  cafe: CafeForJsonLd | null | undefined
): JsonLd => {
  const path = `/product/${product.shortId}`;
  const url = absoluteUrl(path);
  const image = product.imageUrl || product.externalImageUrl;
  const totalReviews = product.totalReviews ?? 0;
  const isActive = product.isActive !== false;

  const productNode: JsonLd = {
    "@type": "Product",
    "@id": `${url}#product`,
    name: product.name,
    ...(product.nameEn ? { alternateName: product.nameEn } : {}),
    url,
    sku: product.shortId,
    ...(image ? { image: absoluteUrl(image) } : {}),
    ...(product.description ? { description: product.description } : {}),
    ...(product.category ? { category: product.category } : {}),
    ...(cafe ? { brand: { "@type": "Brand", name: cafe.name } } : {}),
    releaseDate: new Date(product.addedAt).toISOString().slice(0, 10),
    ...(product.price
      ? {
          offers: {
            "@type": "Offer",
            url,
            price: product.price,
            priceCurrency: "KRW",
            availability: isActive
              ? "https://schema.org/InStock"
              : "https://schema.org/Discontinued",
            ...(cafe
              ? { seller: { "@type": "Organization", name: cafe.name } }
              : {}),
          },
        }
      : {}),
    ...(totalReviews > 0 && product.averageRating
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.averageRating,
            reviewCount: totalReviews,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };

  const properties = nutritionProperties(product.nutritions);
  if (properties.length > 0) {
    productNode.additionalProperty = properties;
  }

  return {
    "@context": "https://schema.org",
    "@graph": [
      productNode,
      breadcrumbList([
        { name: SITE_NAME, path: "/" },
        ...(cafe ? [{ name: cafe.name, path: `/cafe/${cafe.slug}` }] : []),
        { name: product.name, path },
      ]),
    ],
  };
};

export const blogPostJsonLd = (post: BlogPost): JsonLd => ({
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  headline: post.title,
  description: post.excerpt,
  datePublished: post.publishedAt,
  inLanguage: "ko-KR",
  url: absoluteUrl(`/blog/${post.id}`),
  image: absoluteUrl(DEFAULT_OG_IMAGE),
  author: {
    "@id": organization["@id"],
    "@type": "Organization",
    name: SITE_NAME,
  },
  publisher: {
    "@id": organization["@id"],
    "@type": "Organization",
    name: SITE_NAME,
  },
});
