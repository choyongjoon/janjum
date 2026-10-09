// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

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
