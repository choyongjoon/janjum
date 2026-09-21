import { type CheerioAPI, load } from "cheerio";
import { logger } from "../../shared/logger";
import type { Nutritions } from "../../shared/nutritions";
import { type Product, writeProductsToJson } from "./crawlerUtils";
import { fetchText, mapWithConcurrency } from "./httpUtils";

// Listing and detail pages are server-rendered, so they are fetched and
// parsed directly instead of rendered in a browser.

// ================================================
// SITE STRUCTURE CONFIGURATION
// ================================================

const SITE_CONFIG = {
  baseUrl: "https://www.theventi.co.kr",
  menuBaseUrl: "https://www.theventi.co.kr/new2022/menu/all.html",
  detailBaseUrl: "https://www.theventi.co.kr/new2022/menu/all-view.new.html",
} as const;

// Tabs in listing order. 신메뉴 comes last: most new items also appear in a
// regular tab, which keeps them under their usual category, but some are
// listed only there.
const MENU_CATEGORIES = [
  { name: "커피", mode: 2 },
  { name: "디카페인", mode: 3 },
  { name: "아이스 블렌디드", mode: 4 },
  { name: "주스/에이드", mode: 5 },
  { name: "버블티/티", mode: 6 },
  { name: "베버리지", mode: 7 },
  { name: "사이드메뉴/RTD", mode: 8 },
  { name: "신메뉴", mode: 1 },
] as const;

const SELECTORS = {
  productLink: 'a[href*="all-view.new.html"]',
  detailName: "p.tit",
  detailImage: ".img_bx img",
  detailDescription: ".txt.scroll-con-y",
  nutritionTable: "table.table",
} as const;

// ================================================
// REGEX PATTERNS
// ================================================

const SERVING_SIZE_REGEX = /([\d,]+(?:\.\d+)?)\s*(ml|g)/i;
const NUMERIC_REGEX = /[\d,]*\.?\d+/;
const UID_REGEX = /uid=(\d+)/;
const WHITESPACE_REGEX = /\s+/g;
const COMMA_REGEX = /,/g;

// Descriptions shorter than this are placeholders
const MIN_DESCRIPTION_LENGTH = 6;

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

interface ListedProduct {
  categoryName: string;
  uid: string;
}

type NutritionFieldKey =
  | "calories"
  | "sugar"
  | "protein"
  | "saturatedFat"
  | "natrium"
  | "caffeine";

const NUTRITION_FIELD_MAP: {
  keyword: string;
  field: NutritionFieldKey;
  unit: string;
}[] = [
  { keyword: "열량", field: "calories", unit: "kcal" },
  { keyword: "kcal", field: "calories", unit: "kcal" },
  { keyword: "당류", field: "sugar", unit: "g" },
  { keyword: "단백질", field: "protein", unit: "g" },
  { keyword: "포화지방", field: "saturatedFat", unit: "g" },
  { keyword: "나트륨", field: "natrium", unit: "mg" },
  { keyword: "카페인", field: "caffeine", unit: "mg" },
];

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

function parseNumber(text: string): number | undefined {
  const match = text.match(NUMERIC_REGEX);
  return match
    ? Number.parseFloat(match[0].replace(COMMA_REGEX, ""))
    : undefined;
}

// Header "1회 제공량" holds "라지(600ml) 점보(960ml)" or "120 g"; other cells
// hold "18 (18%)" or "고카페인 266"
function extractNutritionData($: CheerioAPI): Nutritions | null {
  const table = $(SELECTORS.nutritionTable).first();
  const headers = table
    .find("thead th")
    .map((_, cell) => $(cell).text().trim())
    .get();
  const values = table
    .find("tbody td")
    .map((_, cell) => $(cell).text().trim())
    .get();
  if (headers.length <= 3 || values.length === 0) {
    return null;
  }

  const nutritions: Nutritions = {};
  let hasData = false;

  for (const [index, header] of headers.entries()) {
    const value = values[index];
    if (!value || value === "-") {
      continue;
    }

    if (header.includes("제공량")) {
      const size = value.match(SERVING_SIZE_REGEX);
      if (size) {
        nutritions.servingSize = Number.parseFloat(
          size[1].replace(COMMA_REGEX, "")
        );
        nutritions.servingSizeUnit = size[2].toLowerCase();
        hasData = true;
      }
      continue;
    }

    const mapping = NUTRITION_FIELD_MAP.find((m) => header.includes(m.keyword));
    if (mapping) {
      nutritions[mapping.field] = parseNumber(value);
      (nutritions as Record<string, unknown>)[`${mapping.field}Unit`] =
        mapping.unit;
      hasData = true;
    }
  }

  return hasData ? nutritions : null;
}

async function fetchCategoryProducts(category: {
  name: string;
  mode: number;
}): Promise<ListedProduct[]> {
  try {
    const $ = load(
      await fetchText(`${SITE_CONFIG.menuBaseUrl}?mode=${category.mode}`)
    );
    const uids = new Set<string>();
    $(SELECTORS.productLink).each((_, link) => {
      const uid = $(link).attr("href")?.match(UID_REGEX)?.[1];
      if (uid) {
        uids.add(uid);
      }
    });

    logger.info(`📋 ${category.name}: ${uids.size} products`);
    const listed = [...uids].map((uid) => ({
      categoryName: category.name,
      uid,
    }));
    return isTestMode ? listed.slice(0, maxProductsInTestMode) : listed;
  } catch (error) {
    logger.error(`❌ Failed to process category ${category.name}: ${error}`);
    return [];
  }
}

async function crawlProduct({
  categoryName,
  uid,
}: ListedProduct): Promise<Product | null> {
  const externalUrl = `${SITE_CONFIG.detailBaseUrl}?uid=${uid}`;
  try {
    const $ = load(await fetchText(externalUrl));

    // The title holds tag badges before the name: <span class="tag">NEW</span>
    const title = $(SELECTORS.detailName).first();
    const name =
      title.find("span:not(.tag)").last().text().trim() || title.text().trim();
    if (!name) {
      logger.warn(`⚠️ No product name found for uid=${uid}`);
      return null;
    }

    const src = $(SELECTORS.detailImage).first().attr("src") ?? "";
    const description = $(SELECTORS.detailDescription)
      .first()
      .text()
      .trim()
      .replace(WHITESPACE_REGEX, " ");
    const nutritions = extractNutritionData($);

    logger.info(
      `✅ Extracted: ${name} (uid=${uid})${nutritions ? " with nutrition" : ""}`
    );

    return {
      name,
      nameEn: null,
      description:
        description.length >= MIN_DESCRIPTION_LENGTH ? description : null,
      price: null,
      externalImageUrl: src.startsWith("http")
        ? src
        : `${SITE_CONFIG.baseUrl}${src.startsWith("/") ? "" : "/"}${src}`,
      category: null,
      externalCategory: categoryName,
      externalId: `theventi_${uid}`,
      externalUrl,
      nutritions,
    };
  } catch (error) {
    logger.error(`❌ Failed to process uid=${uid}: ${error}`);
    return null;
  }
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const runTheventiCrawler = async () => {
  try {
    const perCategory = await Promise.all(
      MENU_CATEGORIES.map(fetchCategoryProducts)
    );

    // A product listed in several tabs keeps the first one
    const seen = new Set<string>();
    const listed = perCategory.flat().filter(({ uid }) => {
      if (seen.has(uid)) {
        return false;
      }
      seen.add(uid);
      return true;
    });
    logger.info(`Found ${listed.length} products to crawl`);

    const results = await mapWithConcurrency(
      listed,
      CRAWLER_CONFIG.concurrency,
      crawlProduct
    );
    await writeProductsToJson(
      results.filter((p): p is Product => p !== null),
      "theventi"
    );
  } catch (error) {
    logger.error("The Venti crawler failed:", error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runTheventiCrawler().catch((error) => {
    logger.error("Crawler execution failed:", error);
    process.exit(1);
  });
}
