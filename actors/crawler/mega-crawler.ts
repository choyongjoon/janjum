import { type CheerioAPI, load } from "cheerio";
import { logger } from "../../shared/logger";
import type { Nutritions } from "../../shared/nutritions";
import { type Product, writeProductsToJson } from "./crawlerUtils";
import { fetchText } from "./httpUtils";
import { buildMegaExternalId } from "./megaProductId";

// The menu page loads its list from menu.php, which returns server-rendered
// cards with every product's detail panel (a hidden `.inner_modal`), so the
// endpoint is paged through directly instead of driving a browser.

// ================================================
// SITE STRUCTURE CONFIGURATION
// ================================================

const SITE_CONFIG = {
  baseUrl: "https://www.mega-mgccoffee.com",
  listUrl: "https://www.mega-mgccoffee.com/menu/menu.php",
} as const;

const CATEGORIES = [
  { code: "1", name: "음료" },
  { code: "2", name: "푸드" },
  { code: "3", name: "상품" },
] as const;

type Category = (typeof CATEGORIES)[number];

const SELECTORS = {
  items: "li",
  modal: ".inner_modal",
  name: ".cont_text_title",
  nameEn: ".cont_text_info div.text1",
  description: ".cont_text_info div.text2",
  temperature: ".cont_gallery_list_label",
  servingInfo: ".cont_text .cont_text_inner",
  nutritionItems: ".cont_list ul li",
  pageLink: ".board_page_link",
} as const;

// ================================================
// REGEX PATTERNS
// ================================================

// Values may carry thousands separators ("1,679kcal") and a space before the
// unit ("462 kcal", "10 g")
const NUMBER = String.raw`([\d,]+(?:\.\d+)?)\s*`;
const REGEX_PATTERNS = {
  amount: new RegExp(`${NUMBER}(ml|g)\\b`, "i"),
  calories: new RegExp(`${NUMBER}kcal`, "i"),
  grams: new RegExp(`${NUMBER}g\\b`),
  milligrams: new RegExp(`${NUMBER}mg\\b`),
} as const;
const COMMA_REGEX = /,/g;

// ================================================
// CRAWLER CONFIGURATION
// ================================================

const isTestMode = process.env.CRAWLER_TEST_MODE === "true";
const maxProductsInTestMode = Number.parseInt(
  process.env.CRAWLER_MAX_PRODUCTS || "3",
  10
);

// Safety net in case the pager ever stops reporting a last page
const MAX_PAGES = 50;

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

function parseNumber(value: string): number {
  return Number.parseFloat(value.replace(COMMA_REGEX, ""));
}

// "컵용량 : 591ml" / "158 g" (food weight), then "1회 제공량 328kcal". A later
// line wins, e.g. "1,000ml" then "2kcal(30ml 당)" for a concentrate.
function parseServingInfo(lines: string[], nutrition: Nutritions): void {
  for (const line of lines) {
    const amount = line.match(REGEX_PATTERNS.amount);
    if (amount) {
      nutrition.servingSize = parseNumber(amount[1]);
      nutrition.servingSizeUnit = amount[2].toLowerCase();
    }

    const calories = line.match(REGEX_PATTERNS.calories);
    if (calories) {
      nutrition.calories = parseNumber(calories[1]);
      nutrition.caloriesUnit = "kcal";
    }
  }
}

// "포화지방 19.8g", "나트륨 1,019mg". A value with the wrong unit on the site
// (e.g. "카페인 181.6g") is skipped rather than guessed.
const NUTRIENT_ITEMS: [string, keyof Nutritions, RegExp, string][] = [
  ["포화지방", "saturatedFat", REGEX_PATTERNS.grams, "g"],
  ["당류", "sugar", REGEX_PATTERNS.grams, "g"],
  ["나트륨", "natrium", REGEX_PATTERNS.milligrams, "mg"],
  ["단백질", "protein", REGEX_PATTERNS.grams, "g"],
  ["카페인", "caffeine", REGEX_PATTERNS.milligrams, "mg"],
];

function parseNutritionItems(items: string[], nutrition: Nutritions): void {
  const record = nutrition as Record<string, number | string | undefined>;
  for (const item of items) {
    const entry = NUTRIENT_ITEMS.find(([label]) => item.includes(label));
    if (!entry) {
      continue;
    }
    const [, key, pattern, unit] = entry;
    const match = item.match(pattern);
    if (match) {
      record[key] = parseNumber(match[1]);
      record[`${key}Unit`] = unit;
    }
  }
}

function toProduct(
  $: CheerioAPI,
  element: Parameters<CheerioAPI>[0],
  category: Category
): Product | null {
  const item = $(element);
  const name = item.find(SELECTORS.name).first().text().trim();
  if (!name) {
    return null;
  }

  const modal = item.find(SELECTORS.modal);
  const nutrition: Nutritions = {};
  parseServingInfo(
    modal
      .find(SELECTORS.servingInfo)
      .map((_, node) => $(node).text().trim())
      .get(),
    nutrition
  );
  parseNutritionItems(
    modal
      .find(SELECTORS.nutritionItems)
      .map((_, node) => $(node).text().trim())
      .get(),
    nutrition
  );

  const imageSrc = item.find("img").first().attr("src") ?? "";
  // "HOT" / "ICE" badge on the card: the hot and iced versions of a drink
  // are listed separately under the same name
  const temperature =
    item.find(SELECTORS.temperature).first().text().trim() || null;

  return {
    name,
    nameEn: item.find(SELECTORS.nameEn).first().text().trim() || null,
    description: item.find(SELECTORS.description).first().text().trim() || null,
    price: null,
    externalImageUrl: imageSrc.startsWith("/")
      ? `${SITE_CONFIG.baseUrl}${imageSrc}`
      : imageSrc,
    category: "Drinks",
    externalCategory: category.name,
    externalId: buildMegaExternalId(name, temperature),
    externalUrl: `${SITE_CONFIG.baseUrl}/menu/`,
    nutritions: Object.keys(nutrition).length > 0 ? nutrition : undefined,
  };
}

async function crawlCategory(category: Category): Promise<Product[]> {
  const products: Product[] = [];
  let page = 1;

  // The pager only reveals the last page number once a page is loaded
  while (page <= MAX_PAGES) {
    const params = new URLSearchParams({
      page: String(page),
      menu_category1: category.code,
      menu_category2: category.code,
      category: "",
      list_checkbox_all: "all",
    });
    const $ = load(await fetchText(`${SITE_CONFIG.listUrl}?${params}`));
    const cards = $(SELECTORS.items)
      .filter((_, element) => $(element).children(SELECTORS.modal).length > 0)
      .toArray();
    if (cards.length === 0) {
      break;
    }

    for (const card of cards) {
      const product = toProduct($, card, category);
      if (product) {
        products.push(product);
      }
    }

    const lastPage = Math.max(
      0,
      ...$(SELECTORS.pageLink)
        .map((_, link) => Number($(link).data("page")) || 0)
        .get()
    );
    if (page >= lastPage) {
      break;
    }
    page += 1;
  }

  logger.info(`📋 ${category.name}: ${products.length} products`);
  return isTestMode ? products.slice(0, maxProductsInTestMode) : products;
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const runMegaCrawler = async () => {
  try {
    const perCategory = await Promise.all(CATEGORIES.map(crawlCategory));

    // Never write the same externalId twice -- the uploader would just
    // overwrite the same record
    const seen = new Set<string>();
    const products = perCategory.flat().filter(({ externalId }) => {
      if (seen.has(externalId)) {
        logger.warn(`Dropping duplicate product ${externalId}`);
        return false;
      }
      seen.add(externalId);
      return true;
    });

    for (const product of products) {
      logger.info(
        `✅ Extracted: ${product.name} - Category: ${product.externalCategory}`
      );
    }
    await writeProductsToJson(products, "mega");
  } catch (error) {
    logger.error("Mega crawler failed:", error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runMegaCrawler().catch((error) => {
    logger.error("Crawler execution failed:", error);
    process.exit(1);
  });
}
