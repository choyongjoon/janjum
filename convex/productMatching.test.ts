import { describe, expect, it } from "vitest";
import { normalizeProductName } from "./productMatching";

describe("normalizeProductName", () => {
  it("collapses old 'HOT '/'ICE ' and new 'H-'/'I-' markers to the same key", () => {
    expect(normalizeProductName("HOT 아메리카노")).toBe(
      normalizeProductName("H-아메리카노")
    );
    expect(normalizeProductName("ICE 헤이즐넛 라떼")).toBe(
      normalizeProductName("I-헤이즐넛라떼")
    );
  });

  it("keeps hot and iced variants distinct", () => {
    expect(normalizeProductName("H-아메리카노")).not.toBe(
      normalizeProductName("I-아메리카노")
    );
  });

  it("normalizes whitespace and hyphens in the base name", () => {
    expect(normalizeProductName("디카페인 콜드브루")).toBe(
      normalizeProductName("디카페인콜드브루")
    );
  });

  it("leaves names without a temperature marker untouched apart from spacing", () => {
    expect(normalizeProductName("에스프레소")).toBe("에스프레소");
    expect(normalizeProductName(" 에스프레소 ")).toBe("에스프레소");
  });

  it("does not treat a hangul name as a temperature marker", () => {
    // No latin marker + separator, so the whole name is the base key.
    expect(normalizeProductName("한라봉주스")).toBe("한라봉주스");
  });

  it("does not treat a bare single letter + space as a temperature marker", () => {
    // "H 하우스" is neither the "HOT "/"ICE " word form nor the "H-"/"I-" form,
    // so it must not fold to a temperature key (which could collide with an
    // unrelated product).
    expect(normalizeProductName("H 하우스블렌드")).toBe("h하우스블렌드");
    expect(normalizeProductName("H 하우스블렌드")).not.toBe(
      normalizeProductName("HOT 하우스블렌드")
    );
  });
});
