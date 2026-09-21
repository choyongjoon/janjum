import { type CheerioAPI, load } from "cheerio";
import { logger } from "../../shared/logger";
import type { Nutritions } from "../../shared/nutritions";
import { type Product, writeProductsToJson } from "./crawlerUtils";
import { fetchText, mapWithConcurrency } from "./httpUtils";

// mmthcoffee.com hosts two brands with separate menus: 매머드커피
// (list_coffee*.php) and 매머드 익스프레스 (list*.php/html). Both list pages
// and the shared detail popup are server-rendered, so they are fetched and
// parsed directly. Product ids (menuSeq) never overlap between the brands.

// ================================================
// SITE STRUCTURE CONFIGURATION
// ================================================

const BASE_URL = "https://mmthcoffee.com";
const DETAIL_URL = `${BASE_URL}/sub/menu/list_coffee_view.php?menuSeq=`;

export interface MammothBrand {
  // Page whose tab bar links every category of the brand
  indexPath: string;
  // Category page, e.g. "/sub/menu/list_coffee_sub.php"
  listPath: string;
  slug: string;
}

const SELECTORS = {
  productLink: 'a[href*="goViewB"]',
  name: "strong",
  nameEn: ".eng",
  image: "img",
  description: ".txt_area p",
  nutritionTable: ".i_table table",
} as const;

// ================================================
// REGEX PATTERNS
// ================================================

const MENU_SEQ_REGEX = /goViewB\((\d+)\)/;
const MENU_TYPE_REGEX = /menuType=([A-Z])/;
const OZ_REGEX = /\((\d+(?:\.\d+)?)\s*oz\)/i;
const NUMBER_REGEX = /^[\d,]*\.?\d+/;
const COMMA_REGEX = /,/g;
const WHITESPACE_REGEX = /\s+/g;

const ML_PER_OZ = 29.5735;

// The size tab (32oz / 30oz) repeats drinks listed under their own category,
// so it is crawled last and only contributes what no other tab lists
const SIZE_TAB_MENU_TYPE = "O";

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
  menuType: string;
  name: string;
}

interface ListedProduct {
  categoryName: string;
  imageSrc: string;
  menuSeq: string;
  name: string;
  nameEn: string;
}

type NutrientKey =
  | "calories"
  | "natrium"
  | "carbohydrates"
  | "sugar"
  | "protein"
  | "fat"
  | "transFat"
  | "saturatedFat"
  | "cholesterol"
  | "caffeine";

// Row labels, e.g. "칼로리 (Kcal)", "나트륨 (mg)". 트랜스지방 and 포화지방
// must match before 지방.
const NUTRIENT_LABELS: [string, NutrientKey, string][] = [
  ["칼로리", "calories", "kcal"],
  ["나트륨", "natrium", "mg"],
  ["탄수화물", "carbohydrates", "g"],
  ["당류", "sugar", "g"],
  ["단백질", "protein", "g"],
  ["트랜스지방", "transFat", "g"],
  ["포화지방", "saturatedFat", "g"],
  ["지방", "fat", "g"],
  ["콜레스테롤", "cholesterol", "mg"],
  ["카페인", "caffeine", "mg"],
];

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

function parseNumber(text: string): number | undefined {
  const match = text.trim().match(NUMBER_REGEX);
  return match
    ? Number.parseFloat(match[0].replace(COMMA_REGEX, ""))
    : undefined;
}

// Columns: 구분 | HOT(16oz) | ICE(22oz), with a blank column for a variant
// the drink doesn't come in; food has a single 영양정보 column. Values are
// taken from the first column that has any, and the serving size from that
// column's header so both describe the same cup.
function extractNutritionData($: CheerioAPI): Nutritions | null {
  const table = $(SELECTORS.nutritionTable).first();
  const headers = table
    .find("thead th")
    .map((_, cell) => $(cell).text().trim())
    .get();
  const rows = table
    .find("tbody tr")
    .toArray()
    .map((row) =>
      $(row)
        .find("td")
        .map((_, cell) => $(cell).text().trim())
        .get()
    );

  const column = headers.findIndex(
    (_, index) =>
      index > 0 &&
      rows.some((cells) => parseNumber(cells[index] ?? "") !== undefined)
  );
  if (column < 0) {
    return null;
  }

  const nutritions: Nutritions = {};
  const record = nutritions as Record<string, number | string | undefined>;
  for (const cells of rows) {
    const label = cells[0] ?? "";
    const nutrient = NUTRIENT_LABELS.find(([prefix]) =>
      label.startsWith(prefix)
    );
    const value = parseNumber(cells[column] ?? "");
    if (nutrient && value !== undefined) {
      const [, key, unit] = nutrient;
      record[key] = value;
      record[`${key}Unit`] = unit;
    }
  }

  const oz = headers[column]?.match(OZ_REGEX);
  if (oz) {
    nutritions.servingSize = Math.round(Number.parseFloat(oz[1]) * ML_PER_OZ);
    nutritions.servingSizeUnit = "ml";
  }

  return Object.keys(nutritions).length > 0 ? nutritions : null;
}

// The popup's text area holds the description, then "■ 알레르기 유발 성분 …"
function extractDescription($: CheerioAPI): string | null {
  const description = $(SELECTORS.description)
    .toArray()
    .map((p) => $(p).text().replace(WHITESPACE_REGEX, " ").trim())
    .find((text) => text && !text.startsWith("■"));
  return description ?? null;
}

async function fetchCategories(brand: MammothBrand): Promise<Category[]> {
  const $ = load(await fetchText(`${BASE_URL}${brand.indexPath}`));
  const categories = new Map<string, string>();

  $(`a[href^="${brand.listPath}?menuType="]`).each((_, link) => {
    const menuType = $(link).attr("href")?.match(MENU_TYPE_REGEX)?.[1];
    const name = $(link).text().replace(WHITESPACE_REGEX, "").trim();
    if (menuType && name && !categories.has(menuType)) {
      categories.set(menuType, name);
    }
  });

  return [...categories]
    .map(([menuType, name]) => ({ menuType, name }))
    .sort(
      (a, b) =>
        Number(a.menuType === SIZE_TAB_MENU_TYPE) -
        Number(b.menuType === SIZE_TAB_MENU_TYPE)
    );
}

async function fetchCategoryProducts(
  brand: MammothBrand,
  category: Category
): Promise<ListedProduct[]> {
  try {
    const $ = load(
      await fetchText(
        `${BASE_URL}${brand.listPath}?menuType=${category.menuType}`
      )
    );
    const products: ListedProduct[] = [];
    $(SELECTORS.productLink).each((_, element) => {
      const link = $(element);
      const menuSeq = link.attr("href")?.match(MENU_SEQ_REGEX)?.[1];
      const name = link.find(SELECTORS.name).first().text().trim();
      if (!(menuSeq && name)) {
        return;
      }
      products.push({
        categoryName: category.name,
        imageSrc: link.find(SELECTORS.image).first().attr("src") ?? "",
        menuSeq,
        name,
        nameEn: link.find(SELECTORS.nameEn).first().text().trim(),
      });
    });

    logger.info(`📋 ${category.name}: ${products.length} products`);
    return isTestMode ? products.slice(0, maxProductsInTestMode) : products;
  } catch (error) {
    logger.error(`❌ Failed to process category ${category.name}: ${error}`);
    return [];
  }
}

async function crawlProduct(listed: ListedProduct): Promise<Product> {
  const externalUrl = `${DETAIL_URL}${listed.menuSeq}`;
  let description: string | null = null;
  let nutritions: Nutritions | null = null;

  try {
    const $ = load(await fetchText(externalUrl));
    description = extractDescription($);
    nutritions = extractNutritionData($);
  } catch (error) {
    logger.error(`❌ Detail page failed for ${listed.name}: ${error}`);
  }

  logger.info(
    `✅ Extracted: ${listed.name}${listed.nameEn ? ` (${listed.nameEn})` : ""}${nutritions ? " with nutrition data" : ""}`
  );

  return {
    name: listed.name,
    nameEn: listed.nameEn,
    description,
    externalCategory: listed.categoryName,
    externalId: listed.menuSeq,
    externalImageUrl: listed.imageSrc
      ? new URL(listed.imageSrc, BASE_URL).href
      : "",
    externalUrl,
    price: null,
    category: null, // Set later by the categorizer
    nutritions,
  };
}

// ================================================
// CRAWLER EXPORT
// ================================================

export async function runMammothMenuCrawler(brand: MammothBrand) {
  const categories = await fetchCategories(brand);
  if (categories.length === 0) {
    throw new Error(`No menu categories found for ${brand.slug}`);
  }

  const perCategory = await Promise.all(
    categories.map((category) => fetchCategoryProducts(brand, category))
  );

  // A product listed in several tabs keeps the first one
  const seen = new Set<string>();
  const listed = perCategory.flat().filter(({ menuSeq }) => {
    if (seen.has(menuSeq)) {
      return false;
    }
    seen.add(menuSeq);
    return true;
  });
  logger.info(`Found ${listed.length} products to crawl`);

  const products = await mapWithConcurrency(
    listed,
    CRAWLER_CONFIG.concurrency,
    crawlProduct
  );
  await writeProductsToJson(products, brand.slug);
}
