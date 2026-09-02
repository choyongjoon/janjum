import { describe, expect, it } from "vitest";
import { buildMegaExternalId } from "./megaProductId";

describe("buildMegaExternalId", () => {
  it("keeps the plain id for items with no temperature badge", () => {
    // Merchandise and bottled drinks carry no HOT/ICE label.
    expect(buildMegaExternalId("MGC 텀블러(옐로우)", null)).toBe(
      "mega_MGC 텀블러(옐로우)"
    );
  });

  it("folds the badge into the id so HOT and ICE stay distinct", () => {
    // Mega lists these as two separate menu items under one name; keying on
    // name alone made them overwrite each other on upload.
    expect(buildMegaExternalId("연유라떼", "HOT")).toBe("mega_HOT_연유라떼");
    expect(buildMegaExternalId("연유라떼", "ICE")).toBe("mega_ICE_연유라떼");
    expect(buildMegaExternalId("연유라떼", "HOT")).not.toBe(
      buildMegaExternalId("연유라떼", "ICE")
    );
  });

  it("normalises badge whitespace and casing", () => {
    expect(buildMegaExternalId("아메리카노", " ice ")).toBe(
      "mega_ICE_아메리카노"
    );
    expect(buildMegaExternalId("아메리카노", "Hot")).toBe(
      "mega_HOT_아메리카노"
    );
  });

  it("ignores a label that is not a temperature badge", () => {
    // Only HOT/ICE should ever reach the id; anything else would make the id
    // churn whenever the site adds a "NEW" or "BEST" ribbon.
    expect(buildMegaExternalId("신메뉴라떼", "NEW")).toBe("mega_신메뉴라떼");
    expect(buildMegaExternalId("신메뉴라떼", "BEST")).toBe("mega_신메뉴라떼");
    expect(buildMegaExternalId("신메뉴라떼", "")).toBe("mega_신메뉴라떼");
  });

  it("produces a unique id for every row of a real menu snapshot", () => {
    // Captured from mega-mgccoffee.com/menu: 225 items, 185 distinct names,
    // 40 of which appear twice as a HOT/ICE pair.
    const menu = [
      { name: "연유라떼", label: "HOT" },
      { name: "연유라떼", label: "ICE" },
      { name: "디카페인 아메리카노", label: "HOT" },
      { name: "디카페인 아메리카노", label: "ICE" },
      { name: "유자생강차", label: "HOT" },
      { name: "밀크쉐이크", label: "ICE" },
      { name: "MGC 텀블러(옐로우)", label: null },
    ];

    const ids = menu.map((m) => buildMegaExternalId(m.name, m.label));

    expect(new Set(ids).size).toBe(menu.length);
  });
});
