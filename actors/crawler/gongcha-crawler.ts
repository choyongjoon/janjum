import { type CheerioAPI, load } from "cheerio";
import { logger } from "../../shared/logger";
import type { Nutritions } from "../../shared/nutritions";
import { type Product, writeProductsToJson } from "./crawlerUtils";
import { fetchText, mapWithConcurrency } from "./httpUtils";

// Category and detail pages are server-rendered, so they are fetched and
// parsed directly instead of clicking through each product in a browser.

// ================================================
// SITE STRUCTURE CONFIGURATION
// ================================================

const SITE_CONFIG = {
  baseUrl: "https://www.gong-cha.co.kr",
  categoryUrlTemplate:
    "https://www.gong-cha.co.kr/brand/menu/product?category=",
  defaultCategoryName: "New 시즌 메뉴",
} as const;

const CATEGORIES = [
  // 음료
  { categoryCode: "001001", name: "New 시즌 메뉴" },
  { categoryCode: "001002", name: "베스트셀러" },
  { categoryCode: "001006", name: "밀크티" },
  { categoryCode: "001010", name: "스무디" },
  { categoryCode: "001003", name: "오리지널 티" },
  { categoryCode: "001015", name: "프룻티&모어" },
  { categoryCode: "001011", name: "커피" },
  { categoryCode: "001017", name: "요거티" },
  { categoryCode: "001018", name: "1리터 배달 메뉴" },
  // 푸드
  { categoryCode: "002001", name: "베이커리" },
  { categoryCode: "002004", name: "스낵" },
  { categoryCode: "002006", name: "아이스크림" },
  // MD상품
  { categoryCode: "003001", name: "비식품" },
  { categoryCode: "003002", name: "식품" },
] as const;

const SELECTORS = {
  activeTab: ".tabWrap ul li.active a",
  detailLink: 'a[href*="detail"]',
  description: ".text-a .t2",
  nutritionTable: ".table-list table",
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
// REGEX PATTERNS
// ================================================

const FILE_EXTENSION_REGEX = /\.[^.]*$/;
const WHITESPACE_REGEX = /\s+/g;

// ================================================
// TYPES
// ================================================

interface ListedProduct {
  categoryName: string;
  detailUrl: string;
  imageSrc: string;
  name: string;
}

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

type NutrientKey =
  | "calories"
  | "carbohydrates"
  | "sugar"
  | "protein"
  | "fat"
  | "transFat"
  | "saturatedFat"
  | "natrium"
  | "cholesterol"
  | "caffeine";

// Column header prefixes (whitespace removed). Order matters: 트랜스지방 and
// 포화지방 must match before 지방.
const NUTRIENT_COLUMNS: readonly [string, NutrientKey, string][] = [
  ["열량", "calories", "kcal"],
  ["탄수화물", "carbohydrates", "g"],
  ["당류", "sugar", "g"],
  ["단백질", "protein", "g"],
  ["트랜스지방", "transFat", "g"],
  ["포화지방", "saturatedFat", "g"],
  ["지방", "fat", "g"],
  ["나트륨", "natrium", "mg"],
  // Labeled (g) on the site, but values (e.g. 95) are clearly mg
  ["콜레스테롤", "cholesterol", "mg"],
  ["카페인", "caffeine", "mg"],
];

// 1회 제공량(g), 일회제공량(g), 컵 용량(ml)
const SERVING_SIZE_COLUMN_REGEX = /제공량|용량/;

function parseValue(text: string | undefined): number | undefined {
  const trimmed = text?.trim();
  if (!trimmed || trimmed === "-") {
    return;
  }
  const parsed = Number.parseFloat(trimmed);
  return Number.isNaN(parsed) ? undefined : parsed;
}

// Headers expanded by colspan so each column index maps to one header,
// e.g. <th colspan="2">구분</th> covers both "Cold" and "L".
function extractColumns(
  $: CheerioAPI,
  table: ReturnType<CheerioAPI>
): string[] {
  const columns: string[] = [];
  table.find("thead tr th").each((_, cell) => {
    const name = $(cell).text().replace(WHITESPACE_REGEX, "");
    const span = Number.parseInt($(cell).attr("colspan") ?? "1", 10) || 1;
    for (let i = 0; i < span; i++) {
      columns.push(name);
    }
  });
  return columns;
}

// Rows shortened by a rowspan in an earlier row are aligned to the right,
// where the nutrient columns are.
function alignRow(
  cells: string[],
  columnCount: number
): (string | undefined)[] {
  const offset = columnCount - cells.length;
  return Array.from({ length: columnCount }, (_, i) =>
    i >= offset ? cells[i - offset] : undefined
  );
}

function rowToNutritions(
  columns: string[],
  values: (string | undefined)[]
): Nutritions {
  const nutritions: Nutritions = {};
  const record = nutritions as Record<string, number | string | undefined>;

  columns.forEach((column, i) => {
    const value = parseValue(values[i]);
    if (value === undefined) {
      return;
    }
    if (SERVING_SIZE_COLUMN_REGEX.test(column)) {
      nutritions.servingSize ??= value;
      nutritions.servingSizeUnit ??= column.includes("(ml)") ? "ml" : "g";
      return;
    }
    const match = NUTRIENT_COLUMNS.find(([prefix]) =>
      column.startsWith(prefix)
    );
    if (match && record[match[1]] === undefined) {
      const [, key, unit] = match;
      record[key] = value;
      record[`${key}Unit`] = unit;
    }
  });

  return nutritions;
}

function countNutrients(nutritions: Nutritions): number {
  return NUTRIENT_COLUMNS.filter(([, key]) => {
    const value = nutritions[key];
    return value !== undefined && value > 0;
  }).length;
}

// Tables list one row per variant (Cold/Hot, size, 콘/컵, product/dipping
// sauce); the most complete row wins, the first one on ties.
function extractNutritionData($: CheerioAPI): Nutritions | null {
  const table = $(SELECTORS.nutritionTable).first();
  if (table.length === 0) {
    logger.warn("No nutrition table found on page");
    return null;
  }

  const columns = extractColumns($, table);
  let best: Nutritions | null = null;
  let bestScore = 0;

  table.find("tbody tr").each((_, row) => {
    const cells = $(row)
      .find("td")
      .map((__, cell) => $(cell).text().trim())
      .get();
    const nutritions = rowToNutritions(
      columns,
      alignRow(cells, columns.length)
    );
    const score = countNutrients(nutritions);
    if (score > bestScore) {
      best = nutritions;
      bestScore = score;
    }
  });

  if (!best) {
    logger.warn("No valid nutrition data found in table");
  }
  return best;
}

function isValidProductDescription(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.length > 20 &&
    !trimmed.includes("Follow us") &&
    !trimmed.includes("Menu") &&
    !trimmed.includes("공차") &&
    (trimmed.includes("티") ||
      trimmed.includes("스무디") ||
      trimmed.includes("밀크"))
  );
}

function extractDescription($: CheerioAPI): string {
  const main = $(SELECTORS.description).first();
  if (main.length > 0) {
    return main.text().trim();
  }

  const fallback = $("p")
    .toArray()
    .map((element) => $(element).text())
    .find(isValidProductDescription);
  return fallback?.trim() ?? "";
}

function generateExternalId(imageSrc: string): string {
  const idFromImage = imageSrc
    .split("/")
    .pop()
    ?.replace(FILE_EXTENSION_REGEX, "");
  if (idFromImage) {
    return idFromImage;
  }
  return `gongcha_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

async function fetchCategoryProducts(
  categoryCode: string
): Promise<ListedProduct[]> {
  const url = `${SITE_CONFIG.categoryUrlTemplate}${categoryCode}`;
  try {
    const $ = load(await fetchText(url));
    const categoryName =
      $(SELECTORS.activeTab).first().text().trim() ||
      SITE_CONFIG.defaultCategoryName;

    const containers = $("li")
      .filter((_, element) => $(element).find(SELECTORS.detailLink).length > 0)
      .toArray();
    logger.info(
      `Found ${containers.length} product containers in category: ${categoryName}`
    );

    const products: ListedProduct[] = [];
    for (const element of containers) {
      const container = $(element);
      const name = container.text().replace(WHITESPACE_REGEX, " ").trim();
      if (!name) {
        logger.warn("Could not extract product name from container");
        continue;
      }
      const href = container.find(SELECTORS.detailLink).first().attr("href");
      products.push({
        categoryName,
        name,
        imageSrc: container.find("img").first().attr("src") ?? "",
        detailUrl: href ? new URL(href, SITE_CONFIG.baseUrl).href : "",
      });
    }
    return isTestMode ? products.slice(0, maxProductsInTestMode) : products;
  } catch (error) {
    logger.error(`Error processing category ${url}: ${error}`);
    return [];
  }
}

async function crawlProduct(listed: ListedProduct): Promise<Product> {
  let description = "";
  let nutritions: Nutritions | null = null;

  if (listed.detailUrl) {
    try {
      const $ = load(await fetchText(listed.detailUrl));
      description = extractDescription($);
      nutritions = extractNutritionData($);
      if (!description) {
        logger.warn(`No description found for ${listed.name}`);
      }
    } catch (error) {
      logger.error(`Detail page failed for ${listed.name}: ${error}`);
    }
  }

  logger.info(`✅ Extracted: ${listed.name} (${listed.categoryName})`);

  return {
    name: listed.name,
    nameEn: null,
    description: description || null,
    externalCategory: listed.categoryName,
    externalId: generateExternalId(listed.imageSrc),
    externalImageUrl: listed.imageSrc
      ? new URL(listed.imageSrc, SITE_CONFIG.baseUrl).href
      : "",
    externalUrl:
      listed.detailUrl ||
      `${SITE_CONFIG.categoryUrlTemplate}${CATEGORIES[0].categoryCode}`,
    price: null,
    category: listed.categoryName,
    nutritions,
  };
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const runGongchaCrawler = async () => {
  try {
    logger.info("🚀 Starting Gongcha crawler with all subcategories");

    // Products listed in several categories are kept once per category
    const listed = (
      await Promise.all(
        CATEGORIES.map(({ categoryCode }) =>
          fetchCategoryProducts(categoryCode)
        )
      )
    ).flat();
    logger.info(`Found ${listed.length} products to crawl`);

    const products = await mapWithConcurrency(
      listed,
      CRAWLER_CONFIG.concurrency,
      crawlProduct
    );

    await writeProductsToJson(products, "gongcha");
    logger.info(
      `✅ Successfully crawled all subcategories: ${products.length} total products`
    );
  } catch (error) {
    logger.error("Gongcha crawler failed:", error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runGongchaCrawler().catch((error) => {
    logger.error("Crawler execution failed:", error);
    process.exit(1);
  });
}
