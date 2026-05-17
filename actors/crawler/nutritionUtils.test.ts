import { describe, expect, it } from "vitest";
import {
  createNutritionObject,
  extractNutritionFromText,
  getServingSizeUnit,
  hasAnyNutritionData,
  hasNutritionKeywords,
  parseNutritionMatches,
  parseNutritionValue,
  parseNutritionValueFromText,
  parseNutritionValues,
} from "./nutritionUtils";

const FULL_NUTRITION_TEXT =
  "1회 제공량 355ml 열량 250kcal 단백질 5g 지방 3g 탄수화물 45g 당류 40g 나트륨 150mg 카페인 75mg";

const KCAL_REGEX = /kcal/;
const NON_NUMERIC_REGEX = /(abc)/;
const NUMBER_REGEX = /(\d+(?:\.\d+)?)/;

describe("parseNutritionValue", () => {
  it("returns null for a null match", () => {
    expect(parseNutritionValue(null)).toBeNull();
  });

  it("returns null when the capture group is missing", () => {
    expect(parseNutritionValue("kcal".match(KCAL_REGEX))).toBeNull();
  });

  it("returns null when the captured value is not numeric", () => {
    expect(parseNutritionValue("abc".match(NON_NUMERIC_REGEX))).toBeNull();
  });

  it("parses integer and decimal values", () => {
    expect(parseNutritionValue("250".match(NUMBER_REGEX))).toBe(250);
    expect(parseNutritionValue("12.5".match(NUMBER_REGEX))).toBe(12.5);
  });
});

describe("parseNutritionValueFromText", () => {
  it("returns null for empty, whitespace, or dash values", () => {
    expect(parseNutritionValueFromText(null)).toBeNull();
    expect(parseNutritionValueFromText("")).toBeNull();
    expect(parseNutritionValueFromText("   ")).toBeNull();
    expect(parseNutritionValueFromText(" - ")).toBeNull();
  });

  it("returns null for non-numeric text", () => {
    expect(parseNutritionValueFromText("없음")).toBeNull();
  });

  it("parses numeric text and trims whitespace", () => {
    expect(parseNutritionValueFromText("  30  ")).toBe(30);
    expect(parseNutritionValueFromText("12.5")).toBe(12.5);
  });
});

describe("parseNutritionMatches / parseNutritionValues", () => {
  it("extracts all nutrition fields from Korean nutrition text", () => {
    const values = parseNutritionValues(
      parseNutritionMatches(FULL_NUTRITION_TEXT)
    );

    expect(values).toEqual({
      servingSize: 355,
      calories: 250,
      protein: 5,
      fat: 3,
      carbohydrates: 45,
      sugar: 40,
      sodium: 150,
      caffeine: 75,
    });
  });

  it("returns null for fields absent from the text", () => {
    const values = parseNutritionValues(parseNutritionMatches("열량 100kcal"));

    expect(values.calories).toBe(100);
    expect(values.protein).toBeNull();
    expect(values.caffeine).toBeNull();
  });
});

describe("getServingSizeUnit", () => {
  it("returns null when there is no serving size value", () => {
    expect(getServingSizeUnit(parseNutritionMatches(""), false)).toBeNull();
  });

  it("returns ml for volume-based serving sizes", () => {
    const matches = parseNutritionMatches("제공량 355ml");
    expect(getServingSizeUnit(matches, true)).toBe("ml");
  });

  it("returns g for weight-based serving sizes", () => {
    const matches = parseNutritionMatches("제공량 200g");
    expect(getServingSizeUnit(matches, true)).toBe("g");
  });
});

describe("hasAnyNutritionData", () => {
  it("is false when no core fields are present", () => {
    const values = parseNutritionValues(parseNutritionMatches("나트륨 150mg"));
    expect(hasAnyNutritionData(values)).toBe(false);
  });

  it("is true when at least one core field is present", () => {
    const values = parseNutritionValues(parseNutritionMatches("열량 100kcal"));
    expect(hasAnyNutritionData(values)).toBe(true);
  });
});

describe("hasNutritionKeywords", () => {
  it("detects nutrition-related keywords", () => {
    expect(hasNutritionKeywords("총 열량 칼로리 정보")).toBe(true);
    expect(hasNutritionKeywords("energy 100 kcal")).toBe(true);
    expect(hasNutritionKeywords("영양성분표")).toBe(true);
  });

  it("is false for text without nutrition keywords", () => {
    expect(hasNutritionKeywords("맛있는 아이스 아메리카노")).toBe(false);
  });
});

describe("createNutritionObject", () => {
  it("attaches units only to fields that have a value", () => {
    const matches = parseNutritionMatches(FULL_NUTRITION_TEXT);
    const nutrition = createNutritionObject(
      parseNutritionValues(matches),
      matches
    );

    expect(nutrition.calories).toBe(250);
    expect(nutrition.caloriesUnit).toBe("kcal");
    expect(nutrition.natrium).toBe(150);
    expect(nutrition.natriumUnit).toBe("mg");
    expect(nutrition.cholesterol).toBeUndefined();
    expect(nutrition.cholesterolUnit).toBeUndefined();
  });
});

describe("extractNutritionFromText", () => {
  it("extracts a full nutrition object from valid text", () => {
    const nutrition = extractNutritionFromText(FULL_NUTRITION_TEXT);

    expect(nutrition).not.toBeNull();
    expect(nutrition?.calories).toBe(250);
    expect(nutrition?.protein).toBe(5);
    expect(nutrition?.caffeine).toBe(75);
  });

  it("returns null when text has no core nutrition data", () => {
    expect(extractNutritionFromText("맛있는 음료입니다")).toBeNull();
    expect(extractNutritionFromText("나트륨 150mg")).toBeNull();
  });
});
