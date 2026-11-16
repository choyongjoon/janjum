import { describe, expect, it } from "vitest";
import { jsonLdScript, productJsonLd } from "./structuredData";

const baseProduct = {
  name: "카페 아메리카노",
  shortId: "abc123",
  addedAt: Date.UTC(2025, 0, 2),
  price: 4700,
  isActive: true,
  averageRating: 4.5,
  totalReviews: 3,
  nutritions: { calories: 10, caffeine: 150, caffeineUnit: "mg" },
  externalImageUrl: "https://example.com/a.png",
};

describe("productJsonLd", () => {
  it("builds Product with offer, rating, nutrition and breadcrumbs", () => {
    const data = productJsonLd(baseProduct, {
      name: "스타벅스",
      slug: "starbucks",
    });
    const [product, breadcrumbs] = data["@graph"] as Record<string, unknown>[];

    expect(product).toMatchObject({
      "@type": "Product",
      name: "카페 아메리카노",
      url: "https://janjum.com/product/abc123",
      brand: { "@type": "Brand", name: "스타벅스" },
      releaseDate: "2025-01-02",
      offers: {
        price: 4700,
        priceCurrency: "KRW",
        availability: "https://schema.org/InStock",
      },
      aggregateRating: { ratingValue: 4.5, reviewCount: 3 },
      additionalProperty: [
        { name: "열량", value: 10, unitText: "kcal" },
        { name: "카페인", value: 150, unitText: "mg" },
      ],
    });
    expect(breadcrumbs).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [
        { position: 1, item: "https://janjum.com/" },
        { position: 2, item: "https://janjum.com/cafe/starbucks" },
        { position: 3, item: "https://janjum.com/product/abc123" },
      ],
    });
  });

  it("omits rating without reviews and marks discontinued offers", () => {
    const data = productJsonLd(
      { ...baseProduct, isActive: false, totalReviews: 0, averageRating: 0 },
      null
    );
    const [product] = data["@graph"] as Record<string, unknown>[];
    expect(product.aggregateRating).toBeUndefined();
    expect(product.brand).toBeUndefined();
    expect(product).toMatchObject({
      offers: { availability: "https://schema.org/Discontinued" },
    });
  });
});

describe("jsonLdScript", () => {
  it("escapes < so menu text cannot close the script tag", () => {
    const script = jsonLdScript({ name: "</script><b>" });
    expect(script.children).not.toContain("<");
    expect(JSON.parse(script.children)).toEqual({ name: "</script><b>" });
  });
});
