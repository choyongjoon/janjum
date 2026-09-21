import { type CheerioAPI, load } from "cheerio";
import { logger } from "../../shared/logger";
import type { Nutritions } from "../../shared/nutritions";
import { type Product, writeProductsToJson } from "./crawlerUtils";
import { fetchText } from "./httpUtils";

// Category pages are server-rendered with each product's nutrition in its
// card, so they are fetched and parsed directly instead of in a browser.

// ================================================
// SITE STRUCTURE CONFIGURATION
// ================================================

const SITE_CONFIG = {
  baseUrl: "https://www.coffeebeankorea.com",
  startUrl: "https://www.coffeebeankorea.com/menu/list.asp?category=13",
} as const;

const SELECTORS = {
  // Side menu groups: 1 = drinks, 2 = food. The others are merchandise and
  // gift cards.
  menuGroups: "ul.lnb_wrap2 > li",
  categoryLinks: "> ul li a",
  productContainers: ".menu_list > li",
  name: "dl.txt > dt > span:nth-child(2)",
  nameEn: "dl.txt > dt > span:nth-child(1)",
  image: "img",
  description: "dl.txt > dd",
  nutritionItems: ".info dl",
} as const;

const MENU_GROUP_COUNT = 2;

// ================================================
// REGEX PATTERNS
// ================================================

// Menu list pages; the drinks group also links 엑스트라 (add-ons) elsewhere
const CATEGORY_HREF_REGEX = /^\/menu\/list\.asp\?category=(\d+)$/;
const WHITESPACE_REGEX = /\s+/g;
const NUMBER_REGEX = /^[\d,]*\.?\d+/;
const COMMA_REGEX = /,/g;

// ================================================
// CRAWLER CONFIGURATION
// ================================================

const isTestMode = process.env.CRAWLER_TEST_MODE === "true";
const maxProductsInTestMode = Number.parseInt(
  process.env.CRAWLER_MAX_PRODUCTS || "3",
  10
);

// Safety net in case a page ever keeps returning products
const MAX_PAGES = 20;

// ================================================
// TYPES
// ================================================

interface Category {
  code: string;
  name: string;
  url: string;
}

type NutrientKey =
  | "calories"
  | "natrium"
  | "carbohydrates"
  | "sugar"
  | "protein"
  | "caffeine"
  | "saturatedFat";

// Labels under each value, e.g. "열량 Kcal", "당 g". 포화지방 must match
// before 당 would, and 당 is the site's label for sugar.
const NUTRIENT_LABELS: [string, NutrientKey, string][] = [
  ["열량", "calories", "kcal"],
  ["나트륨", "natrium", "mg"],
  ["탄수화물", "carbohydrates", "g"],
  ["포화지방", "saturatedFat", "g"],
  ["단백질", "protein", "g"],
  ["카페인", "caffeine", "mg"],
  ["당", "sugar", "g"],
];

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

function extractNutritionData(
  $: CheerioAPI,
  container: ReturnType<CheerioAPI>
): Nutritions | null {
  const nutritions: Nutritions = {};
  const record = nutritions as Record<string, number | string | undefined>;
  let hasValue = false;

  container.find(SELECTORS.nutritionItems).each((_, item) => {
    const label = $(item).find("dd").text().replace(WHITESPACE_REGEX, "");
    const match = $(item).find("dt").text().trim().match(NUMBER_REGEX);
    const nutrient = NUTRIENT_LABELS.find(([prefix]) =>
      label.startsWith(prefix)
    );
    if (nutrient && match) {
      const [, key, unit] = nutrient;
      record[key] = Number.parseFloat(match[0].replace(COMMA_REGEX, ""));
      record[`${key}Unit`] = unit;
      hasValue = true;
    }
  });

  return hasValue ? nutritions : null;
}

async function fetchCategories(): Promise<Category[]> {
  const $ = load(await fetchText(SITE_CONFIG.startUrl));
  const categories: Category[] = [];

  $(SELECTORS.menuGroups)
    .slice(0, MENU_GROUP_COUNT)
    .find(SELECTORS.categoryLinks)
    .each((_, link) => {
      const name = $(link).text().trim();
      const href = $(link).attr("href") ?? "";
      const code = href.match(CATEGORY_HREF_REGEX)?.[1];
      if (name && code) {
        categories.push({ code, name, url: `${SITE_CONFIG.baseUrl}${href}` });
      }
    });

  return categories;
}

function parseProducts(
  $: CheerioAPI,
  category: Category,
  seen: Set<string>
): Product[] {
  const products: Product[] = [];

  $(SELECTORS.productContainers).each((_, element) => {
    const container = $(element);
    const name = container.find(SELECTORS.name).first().text().trim();
    const externalId = `coffeebean_${category.name}_${name}`;
    if (!name || seen.has(externalId)) {
      return;
    }
    seen.add(externalId);

    const src = container.find(SELECTORS.image).first().attr("src") ?? "";
    products.push({
      name,
      nameEn: container.find(SELECTORS.nameEn).first().text().trim() || null,
      description:
        container.find(SELECTORS.description).first().text().trim() || null,
      price: null,
      externalImageUrl: src.startsWith("http")
        ? src
        : `${SITE_CONFIG.baseUrl}${src}`,
      category: null, // Set later by the categorizer
      externalCategory: category.name,
      externalId,
      // Page 1 of the category, as stored so far
      externalUrl: category.url,
      nutritions: extractNutritionData($, container),
    });
  });

  return products;
}

async function crawlCategory(category: Category): Promise<Product[]> {
  const products: Product[] = [];
  const seen = new Set<string>();

  try {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `${SITE_CONFIG.baseUrl}/menu/list.asp?page=${page}&category=${category.code}&category2=1`;
      const $ = load(await fetchText(url));
      const pageProducts = parseProducts($, category, seen);
      if (pageProducts.length === 0) {
        break;
      }
      products.push(...pageProducts);
    }
  } catch (error) {
    logger.error(`❌ Failed to process category ${category.name}: ${error}`);
  }

  for (const product of products) {
    logger.info(
      `✅ Extracted: ${product.name}${product.nameEn ? ` (${product.nameEn})` : ""}${product.nutritions ? " with nutrition data" : ""}`
    );
  }
  logger.info(`📋 ${category.name}: ${products.length} products`);
  return isTestMode ? products.slice(0, maxProductsInTestMode) : products;
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const runCoffeebeanCrawler = async () => {
  try {
    const categories = await fetchCategories();
    if (categories.length === 0) {
      throw new Error("No menu categories found");
    }
    const selected = isTestMode ? categories.slice(0, 1) : categories;
    const perCategory = await Promise.all(selected.map(crawlCategory));
    await writeProductsToJson(perCategory.flat(), "coffeebean");
  } catch (error) {
    logger.error("Coffeebean crawler failed:", error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runCoffeebeanCrawler().catch((error) => {
    logger.error("Crawler execution failed:", error);
    process.exit(1);
  });
}
