// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SECRET = "test-secret";

function setup() {
  return convexTest(schema, modules);
}

type TestConvex = ReturnType<typeof setup>;

// Inserts a cafe with `count` new products. Products are added later than
// the bulk-import window, newest first by index.
async function createCafeWithProducts(
  t: TestConvex,
  slug: string,
  count: number,
  newestAddedAt: number
) {
  return await t.run(async (ctx) => {
    const cafeId = await ctx.db.insert("cafes", { name: slug, slug });
    for (let index = 0; index < count; index += 1) {
      await ctx.db.insert("products", {
        cafeId,
        name: `${slug}-${index}`,
        externalId: `${slug}-${index}`,
        externalUrl: "https://example.com",
        addedAt: newestAddedAt - index,
        updatedAt: 0,
        shortId: `${slug}-${index}`,
        isActive: true,
      });
    }
    return cafeId;
  });
}

describe("recent products by cafe", () => {
  it("caps each cafe at perCafe products and pages the rest", async () => {
    const t = setup();
    const later = Date.now() + 2 * ONE_DAY_MS;
    const bigCafe = await createCafeWithProducts(t, "big", 6, later);
    await createCafeWithProducts(t, "small", 2, later + 100);

    const grouped = await t.query(api.products.getRecentByCafe, {
      perCafe: 4,
    });
    expect(grouped.totalCount).toBe(8);
    expect(
      grouped.cafes.map((cafe) => [
        cafe.cafeName,
        cafe.products.length,
        cafe.totalCount,
      ])
    ).toEqual([
      ["small", 2, 2],
      ["big", 4, 6],
    ]);

    const rest = await t.query(api.products.getRecent, {
      cafeId: bigCafe,
      offset: 4,
      limit: 8,
    });
    expect(rest.totalCount).toBe(6);
    expect(rest.products.map((product) => product.name)).toEqual([
      "big-4",
      "big-5",
    ]);
  });
});

describe("upload into a new external category", () => {
  beforeEach(() => {
    vi.stubEnv("CONVEX_UPLOAD_SECRET", SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const crawled = (name: string, externalCategory: string) => ({
    name,
    nameEn: "",
    externalId: name,
    externalUrl: "https://example.com",
    externalCategory,
    externalImageUrl: "",
    description: "",
    category: null,
    price: null,
  });

  it("dates products in a new category to the cafe creation", async () => {
    const t = setup();
    const cafeId = await t.run((ctx) =>
      ctx.db.insert("cafes", { name: "카페", slug: "cafe" })
    );
    await t.mutation(api.dataUploader.uploadProductsFromJson, {
      cafeSlug: "cafe",
      uploadSecret: SECRET,
      products: [crawled("아메리카노", "COFFEE")],
    });

    await t.mutation(api.dataUploader.uploadProductsFromJson, {
      cafeSlug: "cafe",
      uploadSecret: SECRET,
      products: [
        crawled("아메리카노", "COFFEE"),
        crawled("카페라떼", "COFFEE"),
        crawled("크루아상", "BREAD"),
      ],
    });

    const { cafe, products } = await t.run(async (ctx) => ({
      cafe: await ctx.db.get(cafeId),
      products: await ctx.db.query("products").collect(),
    }));
    const addedAt = (name: string) =>
      products.find((product) => product.name === name)?.addedAt;
    expect(addedAt("크루아상")).toBe(Math.floor(cafe?._creationTime ?? 0));
    expect(addedAt("카페라떼")).toBeGreaterThan(cafe?._creationTime ?? 0);
  });
});
