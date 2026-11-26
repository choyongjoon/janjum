import { describe, expect, it } from "vitest";
import {
  resolveProductVariant,
  type VariantCandidate,
  variantTraits,
} from "./productVariants";

const candidate = (
  shortId: string,
  overrides: Partial<VariantCandidate> = {}
): VariantCandidate => ({
  shortId,
  isActive: true,
  addedAt: 0,
  ...overrides,
});

describe("variantTraits", () => {
  it("reads the temperature from Mega Coffee style external ids", () => {
    expect(variantTraits({ externalId: "mega_HOT_아메리카노" })).toEqual({
      temperature: "HOT",
      sizeLabel: undefined,
    });
    expect(
      variantTraits({ externalId: "mega_ICE_아메리카노" }).temperature
    ).toBe("ICE");
  });

  it("does not read a temperature from unrelated ids", () => {
    expect(variantTraits({ externalId: "9200000000038" }).temperature).toBe(
      undefined
    );
    expect(variantTraits({ externalId: "chocolate" }).temperature).toBe(
      undefined
    );
  });

  it("labels the serving size", () => {
    expect(
      variantTraits({
        externalId: "1",
        nutritions: { servingSize: 887, servingSizeUnit: "ml" },
      }).sizeLabel
    ).toBe("887ml");
  });
});

describe("resolveProductVariant", () => {
  it("keeps HOT and ICE variants as separate, labelled pages", () => {
    const hot = candidate("hot", { temperature: "HOT", sizeLabel: "591ml" });
    const ice = candidate("ice", { temperature: "ICE", sizeLabel: "710ml" });
    expect(resolveProductVariant(hot, [hot, ice])).toEqual({
      canonicalShortId: "hot",
      canonicalIsActive: true,
      variantLabel: "HOT",
    });
    expect(resolveProductVariant(ice, [hot, ice]).variantLabel).toBe("ICE");
    expect(resolveProductVariant(ice, [hot, ice]).canonicalShortId).toBe("ice");
  });

  it("labels size variants when the temperature is the same", () => {
    const tall = candidate("tall", { sizeLabel: "355ml" });
    const venti = candidate("venti", { sizeLabel: "887ml" });
    expect(resolveProductVariant(venti, [tall, venti])).toEqual({
      canonicalShortId: "venti",
      canonicalIsActive: true,
      variantLabel: "887ml",
    });
  });

  it("leaves a product without same-name siblings unlabelled", () => {
    const only = candidate("only", { sizeLabel: "355ml" });
    expect(resolveProductVariant(only, [only])).toEqual({
      canonicalShortId: "only",
      canonicalIsActive: true,
      variantLabel: undefined,
    });
  });

  it("points identical active products at the oldest one", () => {
    const first = candidate("b", { addedAt: 1, sizeLabel: "370ml" });
    const second = candidate("a", { addedAt: 2, sizeLabel: "370ml" });
    expect(
      resolveProductVariant(second, [first, second]).canonicalShortId
    ).toBe("b");
    expect(resolveProductVariant(first, [first, second]).canonicalShortId).toBe(
      "b"
    );
  });

  it("points a discontinued variant at the active one of the same variant", () => {
    const oldIce = candidate("oldIce", { isActive: false, temperature: "ICE" });
    const hot = candidate("hot", { temperature: "HOT", addedAt: -1 });
    const ice = candidate("ice", { temperature: "ICE" });
    expect(
      resolveProductVariant(oldIce, [oldIce, hot, ice]).canonicalShortId
    ).toBe("ice");
  });

  it("falls back to any active sibling for a discontinued product", () => {
    const old = candidate("old", { isActive: false });
    const current = candidate("new", { addedAt: 5 });
    expect(resolveProductVariant(old, [old, current])).toEqual({
      canonicalShortId: "new",
      canonicalIsActive: true,
      variantLabel: undefined,
    });
  });

  it("points discontinued copies at the oldest copy", () => {
    const first = candidate("first", { isActive: false, addedAt: 1 });
    const second = candidate("second", { isActive: false, addedAt: 2 });
    expect(resolveProductVariant(second, [first, second])).toEqual({
      canonicalShortId: "first",
      canonicalIsActive: false,
      variantLabel: undefined,
    });
  });
});
