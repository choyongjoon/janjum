import { describe, expect, it } from "vitest";
import { dedupeByExternalId } from "./dedupe";

const product = (externalId: string, overrides: Record<string, unknown> = {}) =>
  ({
    externalId,
    name: `product-${externalId}`,
    price: 4500,
    ...overrides,
  }) as { externalId: string; name: string };

describe("dedupeByExternalId", () => {
  it("leaves a list with unique externalIds untouched", () => {
    const products = [product("a"), product("b"), product("c")];
    const report = dedupeByExternalId(products);

    expect(report.products).toHaveLength(3);
    expect(report.exactDuplicatesDropped).toBe(0);
    expect(report.conflicts).toEqual([]);
  });

  it("drops byte-identical repeats without reporting a conflict", () => {
    // Mega re-extracts the same "All Menu" list on every pagination step.
    const report = dedupeByExternalId([
      product("a"),
      product("a"),
      product("a"),
      product("b"),
    ]);

    expect(report.products).toHaveLength(2);
    expect(report.exactDuplicatesDropped).toBe(2);
    expect(report.conflicts).toEqual([]);
  });

  it("treats rows differing only in key order as identical", () => {
    const report = dedupeByExternalId([
      { externalId: "a", name: "latte", price: 4500 },
      { price: 4500, externalId: "a", name: "latte" },
    ]);

    expect(report.products).toHaveLength(1);
    expect(report.exactDuplicatesDropped).toBe(1);
    expect(report.conflicts).toEqual([]);
  });

  it("compares nested nutrition objects structurally", () => {
    const report = dedupeByExternalId([
      {
        externalId: "a",
        name: "latte",
        nutritions: { calories: 10, sugar: 2 },
      },
      {
        externalId: "a",
        name: "latte",
        nutritions: { sugar: 2, calories: 10 },
      },
    ]);

    expect(report.products).toHaveLength(1);
    expect(report.conflicts).toEqual([]);
  });

  it("reports genuinely different rows that share an externalId", () => {
    // Mega's `mega_${name}` scheme collapses hot and iced into one id.
    const report = dedupeByExternalId([
      { externalId: "a", name: "연유라떼", nutritions: { calories: 351.5 } },
      { externalId: "a", name: "연유라떼", nutritions: { calories: 321.6 } },
    ]);

    expect(report.products).toHaveLength(1);
    expect(report.conflicts).toEqual([
      { externalId: "a", name: "연유라떼", variants: 2 },
    ]);
  });

  it("keeps the first variant so the winner does not depend on file order", () => {
    const first = { externalId: "a", name: "hot", price: 1 };
    const report = dedupeByExternalId([
      first,
      { externalId: "a", name: "iced", price: 2 },
    ]);

    expect(report.products[0]).toBe(first);
  });

  it("separates exact duplicates from conflicting variants in the counts", () => {
    const report = dedupeByExternalId([
      { externalId: "a", name: "hot", price: 1 },
      { externalId: "a", name: "hot", price: 1 },
      { externalId: "a", name: "iced", price: 2 },
      { externalId: "b", name: "other", price: 3 },
    ]);

    expect(report.products).toHaveLength(2);
    // One row dropped for being identical, one skipped for conflicting.
    expect(report.exactDuplicatesDropped).toBe(1);
    expect(report.conflicts).toEqual([
      { externalId: "a", name: "hot", variants: 2 },
    ]);
  });

  it("preserves the order of first appearance", () => {
    const report = dedupeByExternalId([
      product("c"),
      product("a"),
      product("c"),
      product("b"),
    ]);

    expect(report.products.map((p) => p.externalId)).toEqual(["c", "a", "b"]);
  });

  it("handles an empty list", () => {
    const report = dedupeByExternalId([]);

    expect(report.products).toEqual([]);
    expect(report.exactDuplicatesDropped).toBe(0);
    expect(report.conflicts).toEqual([]);
  });
});
