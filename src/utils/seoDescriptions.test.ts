import { describe, expect, it } from "vitest";
import {
  cafeDescription,
  MAX_DESCRIPTION_LENGTH,
  productDescription,
  productTitle,
} from "./seoDescriptions";

describe("productDescription", () => {
  it("leads with price and nutrition facts", () => {
    expect(
      productDescription(
        {
          name: "카페 아메리카노",
          price: 4700,
          nutritions: { calories: 10, caffeine: 150 },
          description: "진한 에스프레소에 물을 더한 커피",
          isActive: true,
        },
        "스타벅스"
      )
    ).toBe(
      "스타벅스 카페 아메리카노: 4,700원 · 10kcal · 카페인 150mg. 진한 에스프레소에 물을 더한 커피"
    );
  });

  it("marks discontinued products and falls back without facts", () => {
    expect(
      productDescription({ name: "딸기 라떼", isActive: false }, "메가커피")
    ).toBe("메가커피 딸기 라떼(단종). 영양 정보와 후기를 확인하세요.");
  });

  it("truncates long official descriptions", () => {
    const result = productDescription({
      name: "라떼",
      description: "가".repeat(300),
    });
    expect(result.length).toBe(MAX_DESCRIPTION_LENGTH);
    expect(result.endsWith("…")).toBe(true);
  });
});

describe("cafeDescription", () => {
  it("includes menu size and main categories in display order", () => {
    expect(
      cafeDescription("스타벅스", [
        { category: "에이드" },
        { category: "커피" },
        { category: "커피" },
        { category: "그 외" },
        { category: undefined },
      ])
    ).toBe(
      "스타벅스 전체 메뉴 5종(커피, 에이드 등)의 가격, 칼로리, 당류, 카페인 등 영양 정보와 사용자 후기를 한곳에서 확인하세요."
    );
  });
});

describe("productTitle", () => {
  it("adds the cafe name so titles match '카페 + 음료' searches", () => {
    expect(productTitle("아메리카노", "스타벅스")).toBe(
      "아메리카노 - 스타벅스 | 잔점"
    );
  });
});
