import { describe, expect, it } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { indexableProducts, type SitemapProduct } from "./sitemapProducts";

const cafeA = "cafeA" as Id<"cafes">;
const cafeB = "cafeB" as Id<"cafes">;

const product = (
  shortId: string,
  cafeId: Id<"cafes">,
  nameKey: string,
  isActive: boolean
): SitemapProduct => ({ shortId, cafeId, nameKey, isActive, updatedAt: 0 });

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
});
