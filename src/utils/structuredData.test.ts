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
  category: "커피",
  nutritions: { calories: 10, sugar: 0, caffeine: 150, caffeineUnit: "mg" },
  externalImageUrl: "https://example.com/a.png",
};
const cafe = { name: "스타벅스", slug: "starbucks" };

const graphOf = (data: Record<string, unknown>) =>
  data["@graph"] as Record<string, unknown>[];

describe("productJsonLd", () => {
  it("describes the drink as a MenuItem with price and nutrition", () => {
    const [menuItem] = graphOf(productJsonLd(baseProduct, cafe));
    expect(menuItem).toMatchObject({
      "@type": "MenuItem",
      name: "카페 아메리카노",
      url: "https://janjum.com/product/abc123",
      offers: {
        price: 4700,
        priceCurrency: "KRW",
        availability: "https://schema.org/InStock",
      },
      nutrition: {
        "@type": "NutritionInformation",
        calories: "10 kcal",
        sugarContent: "0 g",
      },
    });
  });

  it("adds a review-only Product (no offers, one brand, no category) when rated", () => {
    const graph = graphOf(productJsonLd(baseProduct, cafe));
    const products = graph.filter((node) => node["@type"] === "Product");
    expect(products).toHaveLength(1);
    const [product] = products;
    expect(product).toMatchObject({
      brand: { "@type": "Brand", name: "스타벅스" },
      aggregateRating: { ratingValue: 4.5, reviewCount: 3 },
    });
    expect(product.offers).toBeUndefined();
    expect(product.category).toBeUndefined();
  });

  it("emits exactly one aggregateRating per page", () => {
    // Google's review snippets reject an item with several aggregateRating
    // values ("리뷰에 여러 개의 집계 평점이 있습니다"). The page must carry a
    // single rating, on the Product only, never on the MenuItem as well.
    const json = jsonLdScript(productJsonLd(baseProduct, cafe)).children;
    expect(json.match(/"aggregateRating"/g)).toHaveLength(1);
    const [menuItem] = graphOf(productJsonLd(baseProduct, cafe));
    expect(menuItem.aggregateRating).toBeUndefined();
  });

  it("emits no Product without real reviews, and never invents ratings", () => {
    const graph = graphOf(
      productJsonLd(
        { ...baseProduct, price: undefined, totalReviews: 0, averageRating: 0 },
        cafe
      )
    );
    expect(graph.some((node) => node["@type"] === "Product")).toBe(false);
    expect(graph[0].offers).toBeUndefined();
    expect(JSON.stringify(graph)).not.toContain("aggregateRating");
  });

  it("marks discontinued drinks and keeps breadcrumbs", () => {
    const graph = graphOf(
      productJsonLd({ ...baseProduct, isActive: false }, cafe)
    );
    expect(graph[0]).toMatchObject({
      offers: { availability: "https://schema.org/Discontinued" },
    });
    expect(graph.at(-1)).toMatchObject({
      "@type": "BreadcrumbList",
      itemListElement: [
        { position: 1, item: "https://janjum.com/" },
        { position: 2, item: "https://janjum.com/cafe/starbucks" },
        { position: 3, item: "https://janjum.com/product/abc123" },
      ],
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
