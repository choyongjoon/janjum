import { type CheerioAPI, load } from "cheerio";
import { logger } from "../../shared/logger";
import type { Nutritions } from "../../shared/nutritions";
import { type Product, writeProductsToJson } from "./crawlerUtils";
import { fetchText } from "./httpUtils";

// Each category page is server-rendered with every product's description and
// nutrition in its hover card, so one request per category is enough.

// ================================================
// SITE STRUCTURE CONFIGURATION
// ================================================

const SITE_CONFIG = {
  baseUrl: "https://paikdabang.com",
} as const;

// 신메뉴 (menu_new) only repeats products from these pages
const CATEGORIES = [
  { name: "커피", url: "https://paikdabang.com/menu/menu_coffee/" },
  { name: "음료", url: "https://paikdabang.com/menu/menu_drink/" },
  {
    name: "아이스크림/디저트",
    url: "https://paikdabang.com/menu/menu_dessert/",
  },
  { name: "빽스치노", url: "https://paikdabang.com/menu/menu_ccino/" },
] as const;

type Category = (typeof CATEGORIES)[number];

const SELECTORS = {
  menuItems: ".menu_list > ul > li",
  name: "p.menu_tit",
  description: "p.txt",
  image: "img",
  basis: ".menu_ingredient_basis",
  nutritionRow: ".ingredient_table li",
} as const;

// ================================================
// REGEX PATTERNS
// ================================================

// "※ 컵용량 : 510ml", "※ 컵용량 :  473 ml"
const SERVING_SIZE_REGEX =
  /(?:컵용량|중량|용량)\s*:\s*([\d,]+(?:\.\d+)?)\s*(ml|g)\b/i;
const NUMBER_REGEX = /^([\d,]+(?:\.\d+)?)/;
const COMMA_REGEX = /,/g;

// ================================================
// CRAWLER CONFIGURATION
// ================================================

const isTestMode = process.env.CRAWLER_TEST_MODE === "true";
const maxProductsInTestMode = Number.parseInt(
  process.env.CRAWLER_MAX_PRODUCTS || "3",
  10
);

type NutrientKey =
  | "calories"
  | "caffeine"
  | "natrium"
  | "carbohydrates"
  | "sugar"
  | "saturatedFat"
  | "protein";

// Row labels, e.g. "칼로리(kcal)", "당류(g)"
const NUTRIENT_LABELS: [string, NutrientKey, string][] = [
  ["칼로리", "calories", "kcal"],
  ["카페인", "caffeine", "mg"],
  ["나트륨", "natrium", "mg"],
  ["탄수화물", "carbohydrates", "g"],
  ["당류", "sugar", "g"],
  ["포화지방", "saturatedFat", "g"],
  ["단백질", "protein", "g"],
];

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

function parseNumber(text: string): number | undefined {
  const match = text.trim().match(NUMBER_REGEX);
  return match
    ? Number.parseFloat(match[1].replace(COMMA_REGEX, ""))
    : undefined;
}

function extractNutritionData(
  $: CheerioAPI,
  item: ReturnType<CheerioAPI>
): Nutritions | null {
  const nutritions: Nutritions = {};
  const record = nutritions as Record<string, number | string | undefined>;
  let hasValue = false;

  item.find(SELECTORS.nutritionRow).each((_, row) => {
    const cells = $(row).children("div");
    const label = cells.eq(0).text().trim();
    const nutrient = NUTRIENT_LABELS.find(([prefix]) =>
      label.startsWith(prefix)
    );
    const value = parseNumber(cells.eq(1).text());
    if (nutrient && value !== undefined) {
      const [, key, unit] = nutrient;
      record[key] = value;
      record[`${key}Unit`] = unit;
      hasValue = true;
    }
  });

  const serving = item.find(SELECTORS.basis).text().match(SERVING_SIZE_REGEX);
  if (serving) {
    nutritions.servingSize = Number.parseFloat(
      serving[1].replace(COMMA_REGEX, "")
    );
    nutritions.servingSizeUnit = serving[2].toLowerCase();
    hasValue = true;
  }

  return hasValue ? nutritions : null;
}

async function crawlCategory(category: Category): Promise<Product[]> {
  try {
    const $ = load(await fetchText(category.url));
    const products: Product[] = [];
    const seen = new Set<string>();

    for (const element of $(SELECTORS.menuItems).toArray()) {
      const item = $(element);
      const name = item.find(SELECTORS.name).first().text().trim();
      if (name.length <= 2) {
        continue;
      }

      const externalId = `paik_${category.name}_${name}`;
      if (seen.has(externalId)) {
        continue;
      }
      seen.add(externalId);

      const src = item.find(SELECTORS.image).first().attr("src") ?? "";
      const nutritions = extractNutritionData($, item);
      products.push({
        name,
        nameEn: null,
        description:
          item.find(SELECTORS.description).first().text().trim() || null,
        price: null,
        // Kept unencoded, as stored so far, so image URLs don't all change
        externalImageUrl: src.startsWith("http")
          ? src
          : `${SITE_CONFIG.baseUrl}${src}`,
        category: category.name,
        externalCategory: category.name,
        externalId,
        externalUrl: category.url,
        nutritions,
      });
      logger.info(
        `✅ Extracted: ${name} (${category.name})${nutritions ? " with nutrition data" : ""}`
      );
    }

    logger.info(`📦 ${category.name}: ${products.length} products`);
    return isTestMode ? products.slice(0, maxProductsInTestMode) : products;
  } catch (error) {
    logger.error(`❌ Failed to process category ${category.name}: ${error}`);
    return [];
  }
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const runPaikCrawler = async () => {
  try {
    const perCategory = await Promise.all(CATEGORIES.map(crawlCategory));
    await writeProductsToJson(perCategory.flat(), "paik");
  } catch (error) {
    logger.error("Paik crawler failed:", error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runPaikCrawler().catch((error) => {
    logger.error("Crawler execution failed:", error);
    process.exit(1);
  });
}
