import { type CheerioAPI, load } from "cheerio";
import { logger } from "../../shared/logger";
import type { Nutritions } from "../../shared/nutritions";
import { type Product, writeProductsToJson } from "./crawlerUtils";
import { fetchText, mapWithConcurrency } from "./httpUtils";

// The mobile site loads its menu list and nutrition from JSON endpoints, so
// they are called directly instead of rendering pages in a browser.

// ================================================
// SITE STRUCTURE CONFIGURATION
// ================================================

const SITE_CONFIG = {
  baseUrl: "https://mo.twosome.co.kr",
  imageBaseUrl: "https://mcdn.twosome.co.kr",
  productUrlTemplate: "https://mo.twosome.co.kr/mn/menuInfoDetail.do?menuCd=",
  midListUrl: "https://mo.twosome.co.kr/mn/menuInfoMidListAjax.json",
  menuListUrl: "https://mo.twosome.co.kr/mn/menuInfoListAjax.json",
  sizeOptionsUrl: "https://mo.twosome.co.kr/mn/menuSizeOptListAjax.json",
  nutritionUrl: "https://mo.twosome.co.kr/mn/menuAddInfoCntnListAjax.json",
} as const;

// Top-level menu groups (대분류). 상품 (5: beans, tumblers) is not food.
const GROUP_CODES = [
  "1", // 커피/음료
  "2", // 디저트
  "3", // 푸드
  "4", // 홀케이크
] as const;

// The "NEW" subcategory only repeats items listed in the others
const SKIPPED_MID_CODE = "NEW";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
} as const;

const SELECTORS = {
  description: "p.desc",
  nutritionList: "ul.text_list_ts24_type02",
  nutritionRow: "li",
  nutritionLabel: ".label",
  nutritionValue: ".value",
} as const;

// ================================================
// REGEX PATTERNS
// ================================================

// The page selects its default temperature on load: fn_ondoTabClick('010H');
const DEFAULT_TEMPERATURE_REGEX = /fn_ondoTabClick\('(\w+)'\);/;
const NUMBER_REGEX = /([\d,]+(?:\.\d+)?)/;
const AMOUNT_REGEX = /([\d,]+(?:\.\d+)?)\s*(ml|g)\b/i;
const COMMA_REGEX = /,/g;

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

interface MidCategory {
  MID_CD: string;
  MID_NM: string;
}

interface MenuItem {
  EN_MENU_NM?: string;
  MENU_CD: string;
  MENU_IMG_02?: string;
  MENU_NM: string;
  MID_NM: string;
  TOTAL_COUNT?: number;
}

interface SizeOption {
  OPTS: string;
}

interface NutritionRow {
  ADD_INFO_TITLE: string;
  MENU_CNTNT: string;
}

interface ListResponse<T> {
  fetchResultListSet: T[];
}

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

// Label prefixes, e.g. "열량(Kcal)", "당류(g/%)". 트랜스지방 and 포화지방
// must match before 지방.
const NUTRIENT_LABELS: [string, NutrientKey, string][] = [
  ["열량", "calories", "kcal"],
  ["탄수화물", "carbohydrates", "g"],
  ["당류", "sugar", "g"],
  ["단백질", "protein", "g"],
  ["트랜스지방", "transFat", "g"],
  ["포화지방", "saturatedFat", "g"],
  ["지방", "fat", "g"],
  ["나트륨", "natrium", "mg"],
  ["콜레스테롤", "cholesterol", "mg"],
  ["카페인", "caffeine", "mg"],
];

// ================================================
// HTTP HELPERS
// ================================================

async function postJson<T>(url: string, params: Record<string, string>) {
  const text = await fetchText(url, {
    method: "POST",
    headers: {
      ...HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  return JSON.parse(text) as T;
}

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

function parseNumber(text: string): number | undefined {
  const match = text.match(NUMBER_REGEX);
  return match
    ? Number.parseFloat(match[1].replace(COMMA_REGEX, ""))
    : undefined;
}

// Rows are label/value pairs: "1회 제공량" "(컵용량)355ml", "열량(Kcal)" "335",
// "당류(g/%)" "27/27" (grams / daily value). Food lists "1회 제공량" "1개"
// with the weight under "총 제공량" "219g".
function rowsToNutritions(rows: NutritionRow[]): Nutritions | null {
  const nutritions: Nutritions = {};
  const record = nutritions as Record<string, number | string | undefined>;
  let hasValue = false;

  for (const { ADD_INFO_TITLE: label, MENU_CNTNT: value } of rows) {
    const title = label.trim();
    if (title.startsWith("1회 제공량") || title.startsWith("총 제공량")) {
      const amount = value.match(AMOUNT_REGEX);
      if (amount && nutritions.servingSize === undefined) {
        nutritions.servingSize = Number.parseFloat(
          amount[1].replace(COMMA_REGEX, "")
        );
        nutritions.servingSizeUnit = amount[2].toLowerCase();
        hasValue = true;
      }
      continue;
    }

    const nutrient = NUTRIENT_LABELS.find(([prefix]) =>
      title.startsWith(prefix)
    );
    const parsed = parseNumber(value);
    if (nutrient && parsed !== undefined) {
      const [, key, unit] = nutrient;
      record[key] = parsed;
      record[`${key}Unit`] = unit;
      hasValue = true;
    }
  }

  return hasValue ? nutritions : null;
}

function rowsFromHtml($: CheerioAPI): NutritionRow[] {
  return $(SELECTORS.nutritionList)
    .first()
    .find(SELECTORS.nutritionRow)
    .toArray()
    .map((row) => ({
      ADD_INFO_TITLE: $(row).find(SELECTORS.nutritionLabel).text(),
      MENU_CNTNT: $(row).find(SELECTORS.nutritionValue).text(),
    }));
}

// Drinks render a default nutrition block, then the page script swaps in
// the values for its default temperature and first size. Reproduce that so
// the stored values are the ones a visitor sees.
async function fetchDefaultOptionRows(
  menuCd: string,
  html: string
): Promise<NutritionRow[] | null> {
  const temperature = html.match(DEFAULT_TEMPERATURE_REGEX)?.[1];
  if (!temperature) {
    return null;
  }

  const sizes = await postJson<SizeOption[] | "">(SITE_CONFIG.sizeOptionsUrl, {
    menuCd,
    ondoOpt: temperature,
    midCd: "",
  });
  const size = Array.isArray(sizes) ? sizes[0]?.OPTS : undefined;
  if (!size) {
    return null;
  }

  const rows = await postJson<NutritionRow[] | "">(SITE_CONFIG.nutritionUrl, {
    menuCd,
    ondoOpt: temperature,
    sizeOpt: size,
    midCd: "",
  });
  return Array.isArray(rows) && rows.length > 0 ? rows : null;
}

async function fetchMenuItems(groupCode: string): Promise<MenuItem[]> {
  const mids = await postJson<ListResponse<MidCategory>>(
    SITE_CONFIG.midListUrl,
    { grtCd: groupCode }
  );

  const items: MenuItem[] = [];
  for (const mid of mids.fetchResultListSet) {
    if (mid.MID_CD === SKIPPED_MID_CODE) {
      continue;
    }
    const midItems: MenuItem[] = [];
    let page = 1;
    // Pages must be fetched in order until the total is reached
    while (true) {
      const response = await postJson<ListResponse<MenuItem>>(
        SITE_CONFIG.menuListUrl,
        { pageNum: String(page), grtCd: groupCode, midCd: mid.MID_CD }
      );
      const pageItems = response.fetchResultListSet;
      midItems.push(...pageItems);
      const total = pageItems[0]?.TOTAL_COUNT ?? 0;
      if (pageItems.length === 0 || midItems.length >= total) {
        break;
      }
      page += 1;
    }
    logger.info(`📋 ${mid.MID_NM}: ${midItems.length} products`);
    items.push(
      ...(isTestMode ? midItems.slice(0, maxProductsInTestMode) : midItems)
    );
  }
  return items;
}

async function crawlProduct(item: MenuItem): Promise<Product> {
  const externalUrl = `${SITE_CONFIG.productUrlTemplate}${item.MENU_CD}`;
  let description: string | null = null;
  let nutritions: Nutritions | null = null;

  try {
    const html = await fetchText(externalUrl, { headers: HEADERS });
    const $ = load(html);
    description = $(SELECTORS.description).first().text().trim() || null;
    const rows =
      (await fetchDefaultOptionRows(item.MENU_CD, html)) ?? rowsFromHtml($);
    nutritions = rowsToNutritions(rows);
  } catch (error) {
    logger.error(`❌ Detail page failed for ${item.MENU_NM}: ${error}`);
  }

  logger.info(
    `✅ Extracted: ${item.MENU_NM} (menuCode: ${item.MENU_CD})${nutritions ? " with nutrition data" : ""}`
  );

  return {
    name: item.MENU_NM.trim(),
    nameEn: item.EN_MENU_NM?.trim() || null,
    description,
    price: null,
    externalImageUrl: item.MENU_IMG_02
      ? `${SITE_CONFIG.imageBaseUrl}${item.MENU_IMG_02}`
      : "",
    category: null,
    externalCategory: item.MID_NM,
    externalId: `twosome_${item.MENU_CD}`,
    externalUrl,
    nutritions,
  };
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const runTwosomeCrawler = async () => {
  try {
    const perGroup = await Promise.all(GROUP_CODES.map(fetchMenuItems));

    // A menu listed in several subcategories keeps the first one
    const seen = new Set<string>();
    const items = perGroup.flat().filter(({ MENU_CD }) => {
      if (seen.has(MENU_CD)) {
        return false;
      }
      seen.add(MENU_CD);
      return true;
    });
    logger.info(`Found ${items.length} products to crawl`);

    const products = await mapWithConcurrency(
      items,
      CRAWLER_CONFIG.concurrency,
      crawlProduct
    );
    await writeProductsToJson(products, "twosome");
  } catch (error) {
    logger.error("Twosome crawler failed:", error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runTwosomeCrawler().catch((error) => {
    logger.error("Crawler execution failed:", error);
    process.exit(1);
  });
}
