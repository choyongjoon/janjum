import { type CheerioAPI, load } from "cheerio";
import { logger } from "../../shared/logger";
import type { Nutritions } from "../../shared/nutritions";
import { type Product, writeProductsToJson } from "./crawlerUtils";
import { fetchText, mapWithConcurrency } from "./httpUtils";

// The mobile site is fully server-rendered, so pages are fetched and parsed
// directly instead of rendered in a browser.

// ================================================
// SITE STRUCTURE CONFIGURATION
// ================================================

const SITE_CONFIG = {
  baseUrl: "https://m.hollys.co.kr",
  startUrl: "https://m.hollys.co.kr/menu/menuList.do",
} as const;

// ================================================
// CSS SELECTORS & REGEX PATTERNS
// ================================================

const PRICE_REGEX = /[\d,]+/;
const COMMA_REGEX = /,/g;
const NAME_SEPARATOR_REGEX = /\s*\n\s*\t*\s*/;
const SERVING_SIZE_BASIS_REGEX = /(\d+(?:\.\d+)?)\s*(ml)\s*기준/i;
const SERVING_SIZE_REGEX = /1회\s*제공량[^\d]*?(\d+(?:\.\d+)?)\s*(ml|g)/i;
const TOTAL_SIZE_REGEX = /총\s*제공량\s*(\d+(?:\.\d+)?)\s*(ml|g)/i;
const CELL_PREFIX_REGEX = /^\s*(HOT|ICED)\s*:\s*/i;
const CELL_VALUE_REGEX = /^([\d,]+(?:\.\d+)?)/;

const SELECTORS = {
  categoryLinks: ".sec_menu > ul > li > a",
  productLinks: ".menu_list li a",

  detailName: "h3",
  detailImage: "p.img img",
  detailDescription: ".menuList .description, .menuList p:not(.img)",
  detailPrice: ".price, .menuPrice",
  nutritionTable: ".tableType01",
  // "제품영양정보 (1회 제공량 / Regular / 354ml 기준)" above the table
  nutritionCaption: ".menu_info .stit",
} as const;

// ================================================
// CRAWLER CONFIGURATION
// ================================================

const isTestMode = process.env.CRAWLER_TEST_MODE === "true";
const maxProductsInTestMode = Number.parseInt(
  process.env.CRAWLER_MAX_PRODUCTS || "3",
  10
);

const CRAWLER_CONFIG = {
  concurrency: 5,
} as const;

// ================================================
// TYPES
// ================================================

interface Category {
  name: string;
  url: string;
}

interface ProductRequest {
  categoryName: string;
  url: string;
}

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

function toAbsoluteUrl(href: string): string {
  return new URL(href, SITE_CONFIG.baseUrl).href;
}

type NutrientKey =
  | "calories"
  | "sugar"
  | "protein"
  | "saturatedFat"
  | "natrium"
  | "caffeine";

// Row labels of the nutrition table
const NUTRIENT_ROWS: Record<string, [NutrientKey, string]> = {
  칼로리: ["calories", "kcal"],
  당류: ["sugar", "g"],
  단백질: ["protein", "g"],
  포화지방: ["saturatedFat", "g"],
  나트륨: ["natrium", "mg"],
  카페인: ["caffeine", "mg"],
};

// Drinks: "1회 제공량 / Regular / 354ml 기준 ( Grande / 472ml )"
// Food: "총 중량 120g, 1회 제공량 60g"
function extractServingSize(
  caption: string,
  preferTotal: boolean
): Pick<Nutritions, "servingSize" | "servingSizeUnit"> {
  const match =
    (preferTotal ? caption.match(TOTAL_SIZE_REGEX) : null) ??
    caption.match(SERVING_SIZE_BASIS_REGEX) ??
    caption.match(SERVING_SIZE_REGEX) ??
    caption.match(TOTAL_SIZE_REGEX);
  if (!match) {
    return {};
  }
  return {
    servingSize: Number.parseFloat(match[1]),
    servingSizeUnit: match[2].toLowerCase(),
  };
}

// Cells read "365 kcal", "32g (32%)", "HOT : 10.6g/71%" or "1,019mg (51%)".
// Drinks list HOT first, which the product page defaults to.
function parseCell(text: string): number | undefined {
  const match = text.replace(CELL_PREFIX_REGEX, "").match(CELL_VALUE_REGEX);
  return match
    ? Number.parseFloat(match[1].replace(COMMA_REGEX, ""))
    : undefined;
}

function extractNutritionData($: CheerioAPI): Nutritions | null {
  const nutritions: Nutritions = {};
  const record = nutritions as Record<string, number | string | undefined>;
  let hasValue = false;

  $(SELECTORS.nutritionTable)
    .first()
    .find("tr")
    .each((_, row) => {
      const label = $(row).find("th").text().trim();
      const nutrient = NUTRIENT_ROWS[label];
      const value = parseCell($(row).find("td").first().text());
      if (nutrient && value !== undefined) {
        const [key, unit] = nutrient;
        record[key] = value;
        record[`${key}Unit`] = unit;
        hasValue = true;
      }
    });

  const caption = $(SELECTORS.nutritionCaption).first().text();
  // Without a table (bottled drinks, some desserts) only the product size is
  // known, so the total amount is more useful than the per-100ml basis
  const servingSize = extractServingSize(caption, !hasValue);
  if (!(hasValue || servingSize.servingSize)) {
    return null;
  }
  return { ...servingSize, ...nutritions };
}

function parseProductName(rawName: string): {
  name: string;
  nameEn: string | null;
} {
  const cleaned = rawName.trim();
  if (!cleaned) {
    return { name: "", nameEn: null };
  }

  // Korean and English names are separated by a line break in the <h3>
  const parts = cleaned.split(NAME_SEPARATOR_REGEX);
  if (parts.length >= 2) {
    const koreanName = parts[0].trim();
    const englishName = parts[1].trim();
    if (koreanName && englishName) {
      return { name: koreanName, nameEn: englishName };
    }
  }

  return { name: cleaned, nameEn: null };
}

function parsePrice(text: string | null): number | null {
  const match = text?.match(PRICE_REGEX);
  return match ? Number.parseInt(match[0].replace(COMMA_REGEX, ""), 10) : null;
}

function parseProductPage(
  html: string,
  { categoryName, url }: ProductRequest
): Product | null {
  const $ = load(html);

  const { name, nameEn } = parseProductName(
    $(SELECTORS.detailName).first().text()
  );
  if (!name) {
    logger.warn(`⚠️ No product name found on ${url}`);
    return null;
  }

  const imageSrc = $(SELECTORS.detailImage).first().attr("src");
  const description =
    $(SELECTORS.detailDescription).first().text().trim() || null;
  const priceText = $(SELECTORS.detailPrice).first().text().trim() || null;

  return {
    name,
    nameEn,
    description,
    price: parsePrice(priceText),
    externalImageUrl: imageSrc ? toAbsoluteUrl(imageSrc) : "",
    category: null, // Set later by the categorizer
    externalCategory: categoryName,
    externalId: `hollys_${categoryName}_${name}`,
    externalUrl: url,
    nutritions: extractNutritionData($),
  };
}

async function fetchCategories(): Promise<Category[]> {
  const $ = load(await fetchText(SITE_CONFIG.startUrl));
  const categories: Category[] = [];

  $(SELECTORS.categoryLinks).each((_, element) => {
    const name = $(element).text().trim();
    const href = $(element).attr("href");
    if (name && href?.startsWith("/menu")) {
      categories.push({ name, url: toAbsoluteUrl(href) });
    }
  });

  return categories;
}

async function fetchProductRequests(
  category: Category
): Promise<ProductRequest[]> {
  try {
    const $ = load(await fetchText(category.url));
    const urls = $(SELECTORS.productLinks)
      .map((_, element) => $(element).attr("href"))
      .get()
      .filter(Boolean)
      .map(toAbsoluteUrl);

    logger.info(`📋 ${category.name}: ${urls.length} products`);
    const limited = isTestMode ? urls.slice(0, maxProductsInTestMode) : urls;
    return limited.map((url) => ({ categoryName: category.name, url }));
  } catch (error) {
    logger.error(`❌ Failed to process category ${category.name}: ${error}`);
    return [];
  }
}

async function crawlProduct(request: ProductRequest): Promise<Product | null> {
  try {
    const product = parseProductPage(await fetchText(request.url), request);
    if (product) {
      logger.info(
        `✅ Extracted: ${product.name}${product.nameEn ? ` | ${product.nameEn}` : ""}${product.nutritions ? " with nutrition data" : ""}`
      );
    }
    return product;
  } catch (error) {
    logger.error(`❌ Failed to process product ${request.url}: ${error}`);
    return null;
  }
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const runHollysCrawler = async () => {
  try {
    const allCategories = await fetchCategories();
    if (allCategories.length === 0) {
      throw new Error("No menu categories found");
    }
    const categories = isTestMode ? allCategories.slice(0, 1) : allCategories;

    const requestsByCategory = await Promise.all(
      categories.map(fetchProductRequests)
    );

    // A product listed in several categories keeps the first one, in menu
    // order, so its externalId stays stable.
    const seen = new Set<string>();
    const requests = requestsByCategory.flat().filter(({ url }) => {
      if (seen.has(url)) {
        return false;
      }
      seen.add(url);
      return true;
    });
    logger.info(`Found ${requests.length} products to crawl`);

    const results = await mapWithConcurrency(
      requests,
      CRAWLER_CONFIG.concurrency,
      crawlProduct
    );
    const products = results.filter((p): p is Product => p !== null);

    const failedCount = requests.length - products.length;
    if (failedCount > 0) {
      logger.warn(`⚠️ ${failedCount} products could not be extracted`);
    }

    await writeProductsToJson(products, "hollys");
  } catch (error) {
    logger.error("Hollys crawler failed:", error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runHollysCrawler().catch((error) => {
    logger.error("Crawler execution failed:", error);
    process.exit(1);
  });
}
