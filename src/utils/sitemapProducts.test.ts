import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { indexableProducts, type SitemapProduct } from "./sitemapProducts";

const cafeA = "cafeA" as Id<"cafes">;
const cafeB = "cafeB" as Id<"cafes">;

const product = (
  shortId: string,
  cafeId: Id<"cafes">,
  nameKey: string,
  isActive: boolean,
  overrides: Partial<SitemapProduct> = {}
): SitemapProduct => ({
  shortId,
  cafeId,
  nameKey,
  isActive,
  updatedAt: 0,
  addedAt: 0,
  ...overrides,
});

describe("indexableProducts", () => {
  it("drops a discontinued product that duplicates an active one", () => {
    const result = indexableProducts([
      product("old", cafeA, "아메리카노", false),
      product("new", cafeA, "아메리카노", true),
    ]);
    expect(result.map((p) => p.shortId)).toEqual(["new"]);
  });

  it("keeps discontinued products with no active twin in the same cafe", () => {
    const result = indexableProducts([
      product("gone", cafeA, "시즌라떼", false),
      product("other", cafeB, "시즌라떼", true),
    ]);
    expect(result.map((p) => p.shortId)).toEqual(["gone", "other"]);
  });

  it("keeps both HOT and ICE variants of a drink", () => {
    const result = indexableProducts([
      product("hot", cafeA, "아메리카노", true, { temperature: "HOT" }),
      product("ice", cafeA, "아메리카노", true, { temperature: "ICE" }),
      product("oldIce", cafeA, "아메리카노", false, { temperature: "ICE" }),
    ]);
    expect(result.map((p) => p.shortId)).toEqual(["hot", "ice"]);
  });

  it("keeps only the oldest of discontinued copies", () => {
    const result = indexableProducts([
      product("second", cafeA, "사과생크림와플", false, { addedAt: 2 }),
      product("first", cafeA, "사과생크림와플", false, { addedAt: 1 }),
    ]);
    expect(result.map((p) => p.shortId)).toEqual(["first"]);
  });

  it("falls back to the old rule when Convex has not deployed yet", () => {
    const legacy = (shortId: string, isActive: boolean) => {
      const { addedAt: _addedAt, ...rest } = product(
        shortId,
        cafeA,
        "와플",
        isActive
      );
      return rest as SitemapProduct;
    };
    const result = indexableProducts([legacy("a", false), legacy("b", false)]);
    expect(result.map((p) => p.shortId)).toEqual(["a", "b"]);
  });
});
