import { describe, expect, it } from "vitest";
import {
  applyVoucherPrices,
  parseBrandPage,
  parseProductName,
  parseVoucherName,
} from "./gifticonPrices";

const product = (
  name: string,
  externalId = name,
  price: number | null = null
) => ({
  externalId,
  name,
  price,
});

describe("parseVoucherName", () => {
  it("strips the brand, temperature and size", () => {
    expect(
      parseVoucherName("메가MGC커피 (ICE)카페라떼", ["메가MGC커피"])
    ).toEqual({ key: "카페라떼", size: null, temperature: "ICE" });
    expect(
      parseVoucherName("스타벅스 아이스 카페 라떼T", ["스타벅스"])
    ).toEqual({ key: "카페라떼", size: "T", temperature: "ICE" });
    expect(
      parseVoucherName("투썸플레이스  HOT 아메리카노 R", ["투썸플레이스"])
    ).toEqual({ key: "아메리카노", size: "R", temperature: "HOT" });
    expect(
      parseVoucherName("컴포즈커피 카푸치노(OnlyHot)(TAKE-OUT)", ["컴포즈커피"])
    ).toEqual({ key: "카푸치노", size: null, temperature: "HOT" });
    expect(
      parseVoucherName("탐앤탐스 카페라떼 T (ICE/HOT)", ["탐앤탐스"])
    ).toEqual({ key: "카페라떼", size: "T", temperature: null });
  });

  it("skips sets, bundles and cash vouchers", () => {
    const prefixes = ["커피빈"];
    for (const name of [
      "커피빈 1만원권",
      "커피빈 카페라떼 (S) 2",
      "커피빈 더블 브레베 라떼 (R) 2잔",
      "커피빈 아메리카노 (S) + 말돈소금빵",
      "커피빈 모바일교환권 30,000원권",
    ]) {
      expect(parseVoucherName(name, prefixes)).toBeNull();
    }
    expect(
      parseVoucherName("메가MGC커피 감사합니다 세트", ["메가MGC커피"])
    ).toBeNull();
  });
});

describe("parseProductName", () => {
  it("reads the temperature from 메가's external id", () => {
    expect(parseProductName(product("카페라떼", "mega_HOT_카페라떼"))).toEqual({
      key: "카페라떼",
      size: null,
      temperature: "HOT",
    });
  });

  it("reads 컴포즈 and 이디야 name prefixes", () => {
    expect(parseProductName(product("I-돌체라떼"))).toMatchObject({
      key: "돌체라떼",
      temperature: "ICE",
    });
    expect(parseProductName(product("(L) ICED 카페 라떼"))).toEqual({
      key: "카페라떼",
      size: "L",
      temperature: "ICE",
    });
  });
});

describe("applyVoucherPrices", () => {
  it("matches by temperature and keeps prices the crawler found", () => {
    const { matched, products } = applyVoucherPrices(
      [
        product("아메리카노", "mega_HOT_아메리카노"),
        product("아메리카노", "mega_ICE_아메리카노"),
        product("핫초코", "mega_HOT_핫초코"),
        product("카페라떼", "mega_ICE_카페라떼", 9999),
        product("밀크쉐이크", "mega_ICE_밀크쉐이크"),
      ],
      [
        { name: "메가MGC커피 (HOT)아메리카노", price: 1700 },
        { name: "메가MGC커피 (ICE)아메리카노", price: 2000 },
        { name: "메가MGC커피 핫초코", price: 3500 },
        { name: "메가MGC커피 (ICE)카페라떼", price: 2900 },
      ],
      ["메가MGC커피"]
    );
    expect(products.map((p) => p.price)).toEqual([
      1700,
      2000,
      3500,
      9999,
      null,
    ]);
    expect(matched).toBe(3);
  });

  it("uses the smallest cup unless the menu item names a size", () => {
    const { products } = applyVoucherPrices(
      [
        product("아메리카노"),
        product("(L) ICED 카페 라떼"),
        product("(EX) ICED 카페 라떼"),
      ],
      [
        { name: "투썸플레이스  HOT 아메리카노 R", price: 4700 },
        { name: "투썸플레이스  아메리카노 L", price: 5300 },
        { name: "투썸플레이스  아이스 아메리카노 MAX", price: 6100 },
        { name: "이디야커피 ICED 카페 라떼 (L)", price: 4200 },
      ],
      ["투썸플레이스", "이디야커피"]
    );
    expect(products.map((p) => p.price)).toEqual([4700, 4200, null]);
  });
});

describe("parseBrandPage", () => {
  it("reads names and list prices, before any discount", () => {
    const html = `
      <ul>
        <li><a><span class="prod_name_2" title="메가MGC커피 (HOT)아메리카노">x</span></a>
          <span class="sail"><em><span class="ir">할인후</span><strong>1,700원</strong></em></span></li>
        <li><a><span class="prod_name_2" title="커피빈 1만원권">x</span></a>
          <span class="cost"><span class="ir">할인전</span>10,000원</span>
          <span class="sail"><em><span class="ir">할인후</span><strong>8,700원</strong></em></span></li>
        <li>no product here</li>
      </ul>`;
    expect(parseBrandPage(html)).toEqual([
      { name: "메가MGC커피 (HOT)아메리카노", price: 1700 },
      { name: "커피빈 1만원권", price: 10_000 },
    ]);
  });
});
