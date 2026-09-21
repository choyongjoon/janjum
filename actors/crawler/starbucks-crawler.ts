import { logger } from "../../shared/logger";
import type { Nutritions } from "../../shared/nutritions";
import { type Product, writeProductsToJson } from "./crawlerUtils";
import { parseNutritionValueFromText } from "./nutritionUtils";

// The site renders everything from JSON: the drink list is built from
// per-category JSON files, and each detail page embeds its product as an
// inline `remapView({...})` call. Fetching those directly avoids a browser
// (~11 min for ~200 pages in CI) and finishes in seconds.

// ================================================
// SITE STRUCTURE CONFIGURATION
// ================================================

const SITE_CONFIG = {
  baseUrl: "https://www.starbucks.co.kr",
  categoryJsonUrl: "https://www.starbucks.co.kr/upload/json/menu/",
  productUrlTemplate:
    "https://www.starbucks.co.kr/menu/drink_view.do?product_cd=",
  admDataUrl: "https://www.starbucks.co.kr/common/getAdmData.do",
  imageBaseUrl: "https://image.istarbucks.co.kr",
} as const;

// Category codes from getCateCodeCng() on drink_list.do, in page order
const CATEGORY_CODES = [
  "W0000171", // 콜드 브루
  "W0000060", // 브루드 커피
  "W0000003", // 에스프레소
  "W0000004", // 프라푸치노
  "W0000005", // 블렌디드
  "W0000422", // 스타벅스 리프레셔
  "W0000061", // 스타벅스 피지오
  "W0000075", // 티
  "W0000053", // 기타 제조 음료
  "W0000062", // 스타벅스 주스(병음료)
] as const;

// Size table from renderViewInfo() on drink_view.do. Drinks measured in oz
// are mapped to their ml size; bottled drinks are listed in ml directly.
const OZ_TO_ML: Record<number, number> = {
  0.75: 22,
  1.5: 44,
  7: 207,
  8: 237,
  10: 296,
  12: 355,
  16: 473,
  20: 591,
};

// Hardcoded overrides from renderViewInfo()
const MINI_SKUS = new Set(["9200000003657", "9200000003656", "9200000003655"]);
const MINI_ML = 709;
const BOTTLE_SKU = "9200000003661";
const BOTTLE_ML = 500;
const TRENTA_ML = 887;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
  "Accept-Language": "ko-KR,ko;q=0.9",
} as const;

// ================================================
// REGEX PATTERNS
// ================================================

const PATTERNS = {
  view: /remapView\((\{.*?\})\),\s*\n/,
  file: /remapFile\((\[.*?\])\),\s*\n/,
  whitespace: /\s+/g,
  crlf: /\r\n?/g,
  ml: /^(\d+(?:\.\d+)?)\s*ml/i,
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
  maxRetries: 2,
  retryDelayMs: 1000,
  requestTimeoutMs: 20_000,
} as const;

// ================================================
// TYPES
// ================================================

interface CategoryJson {
  list: { product_CD: string }[];
}

interface ViewData {
  CAFFEINE?: string;
  CATE_NAME?: string;
  CHABO?: string;
  CHOLESTEROL?: string;
  CONTENT?: string;
  FAT?: string;
  KCAL?: string;
  PRODUCT_CD?: string;
  PRODUCT_ENGNM?: string;
  PRODUCT_NM?: string;
  PROTEIN?: string;
  SAT_FAT?: string;
  SODIUM?: string;
  STANDARD?: string;
  SUGARS?: string;
  TRANS_FAT?: string;
  UNIT?: string;
}

interface FileData {
  FILE_PATH?: string;
  IMG_UPLOAD_PATH?: string;
}

// ================================================
// HTTP HELPERS
// ================================================

async function fetchText(url: string, init?: RequestInit): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= CRAWLER_CONFIG.maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: { ...HEADERS, ...init?.headers },
        signal: AbortSignal.timeout(CRAWLER_CONFIG.requestTimeoutMs),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < CRAWLER_CONFIG.maxRetries) {
        await new Promise((resolve) =>
          setTimeout(resolve, CRAWLER_CONFIG.retryDelayMs * (attempt + 1))
        );
      }
    }
  }
  throw new Error(`Failed to fetch ${url}: ${lastError}`);
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    const index = cursor;
    cursor += 1;
    if (index >= items.length) {
      return;
    }
    results[index] = await fn(items[index]);
    await worker();
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

async function fetchProductIds(): Promise<string[]> {
  const lists = await Promise.all(
    CATEGORY_CODES.map(async (code) => {
      const text = await fetchText(`${SITE_CONFIG.categoryJsonUrl}${code}.js`);
      const data = JSON.parse(text) as CategoryJson;
      logger.info(`Category ${code}: ${data.list.length} products`);
      return data.list.map((item) => item.product_CD);
    })
  );
  return [...new Set(lists.flat().filter(Boolean))];
}

async function fetchTrentaSkus(): Promise<Set<string>> {
  try {
    const text = await fetchText(SITE_CONFIG.admDataUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ "rqstCodeList[]": "TRENTA_SKU_LIST" }),
    });
    const data = JSON.parse(text) as {
      data?: { rqst_code_value?: string }[];
    };
    const value = data.data?.[0]?.rqst_code_value ?? "";
    return new Set(value.replace(PATTERNS.whitespace, "").split("|"));
  } catch (error) {
    logger.warn(`Failed to fetch Trenta SKU list: ${error}`);
    return new Set();
  }
}

function extractServingSize(
  view: ViewData,
  productId: string,
  trentaSkus: Set<string>
): number | undefined {
  if (MINI_SKUS.has(productId)) {
    return MINI_ML;
  }
  if (productId === BOTTLE_SKU) {
    return BOTTLE_ML;
  }
  if (trentaSkus.has(productId)) {
    return TRENTA_ML;
  }

  const unit = view.UNIT ?? "";
  const standard = view.STANDARD ?? "";
  if (unit.startsWith("oz")) {
    return OZ_TO_ML[Number.parseFloat(standard)];
  }
  if (unit.startsWith("ml")) {
    const match = `${standard}${unit}`.match(PATTERNS.ml);
    return match ? Number.parseFloat(match[1]) : undefined;
  }
  return;
}

function withUnit<U extends string>(
  text: string | undefined,
  unit: U
): { value: number | undefined; unit: U | undefined } {
  const value = parseNutritionValueFromText(text ?? null) ?? undefined;
  return { value, unit: value === undefined ? undefined : unit };
}

function extractNutritions(
  view: ViewData,
  servingSize: number | undefined
): Nutritions | null {
  const hasCalories = parseNutritionValueFromText(view.KCAL ?? null) !== null;
  const hasProtein = parseNutritionValueFromText(view.PROTEIN ?? null) !== null;

  // Nutrition values not published yet: keep the serving size only
  if (!(hasCalories || hasProtein)) {
    return servingSize ? { servingSize, servingSizeUnit: "ml" } : null;
  }

  const calories = withUnit(view.KCAL, "kcal");
  const carbohydrates = withUnit(view.CHABO, "g");
  const sugar = withUnit(view.SUGARS, "g");
  const protein = withUnit(view.PROTEIN, "g");
  const fat = withUnit(view.FAT, "g");
  const transFat = withUnit(view.TRANS_FAT, "g");
  const saturatedFat = withUnit(view.SAT_FAT, "g");
  const natrium = withUnit(view.SODIUM, "mg");
  const cholesterol = withUnit(view.CHOLESTEROL, "mg");
  const caffeine = withUnit(view.CAFFEINE, "mg");

  return {
    servingSize,
    servingSizeUnit: "ml",
    calories: calories.value,
    caloriesUnit: calories.unit,
    carbohydrates: carbohydrates.value,
    carbohydratesUnit: carbohydrates.unit,
    sugar: sugar.value,
    sugarUnit: sugar.unit,
    protein: protein.value,
    proteinUnit: protein.unit,
    fat: fat.value,
    fatUnit: fat.unit,
    transFat: transFat.value,
    transFatUnit: transFat.unit,
    saturatedFat: saturatedFat.value,
    saturatedFatUnit: saturatedFat.unit,
    natrium: natrium.value,
    natriumUnit: natrium.unit,
    cholesterol: cholesterol.value,
    cholesterolUnit: cholesterol.unit,
    caffeine: caffeine.value,
    caffeineUnit: caffeine.unit,
  };
}

function extractImageUrl(files: FileData[]): string {
  const first = files[0];
  if (!first?.FILE_PATH) {
    return "";
  }
  const base = (first.IMG_UPLOAD_PATH || SITE_CONFIG.imageBaseUrl).replace(
    "www",
    "image"
  );
  return `${base}${first.FILE_PATH}`;
}

function parseProductPage(
  html: string,
  productId: string,
  trentaSkus: Set<string>
): Product | null {
  const viewMatch = html.match(PATTERNS.view);
  if (!viewMatch) {
    logger.warn(`⚠️ No product data found on page for ID: ${productId}`);
    return null;
  }
  const view = JSON.parse(viewMatch[1]) as ViewData;
  const fileMatch = html.match(PATTERNS.file);
  const files = fileMatch ? (JSON.parse(fileMatch[1]) as FileData[]) : [];

  const name = (view.PRODUCT_NM ?? "").trim();
  const externalId = view.PRODUCT_CD || productId;
  if (!name) {
    logger.warn(`⚠️ Missing product name for ID: ${productId}`);
    return null;
  }

  const servingSize = extractServingSize(view, externalId, trentaSkus);

  return {
    name,
    nameEn: (view.PRODUCT_ENGNM ?? "").trim(),
    description: (view.CONTENT ?? "").replace(PATTERNS.crlf, "\n").trim(),
    externalCategory: (view.CATE_NAME ?? "").trim(),
    externalId,
    externalImageUrl: extractImageUrl(files),
    externalUrl: `${SITE_CONFIG.productUrlTemplate}${externalId}`,
    price: null,
    category: "Drinks",
    nutritions: extractNutritions(view, servingSize),
  };
}

async function crawlProduct(
  productId: string,
  trentaSkus: Set<string>
): Promise<Product | null> {
  try {
    const html = await fetchText(
      `${SITE_CONFIG.productUrlTemplate}${productId}`
    );
    const product = parseProductPage(html, productId, trentaSkus);
    if (product) {
      logger.info(
        `✅ Extracted: ${product.name} (${product.nameEn}) - ID: ${product.externalId}`
      );
    }
    return product;
  } catch (error) {
    logger.error(`❌ Error processing product ${productId}: ${error}`);
    return null;
  }
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const runStarbucksCrawler = async () => {
  try {
    const [allIds, trentaSkus] = await Promise.all([
      fetchProductIds(),
      fetchTrentaSkus(),
    ]);
    logger.info(`Found ${allIds.length} products to crawl`);

    const productIds = isTestMode
      ? allIds.slice(0, maxProductsInTestMode)
      : allIds;
    if (isTestMode) {
      logger.info(`🧪 Test mode: limiting to ${productIds.length} products`);
    }

    const results = await mapWithConcurrency(
      productIds,
      CRAWLER_CONFIG.concurrency,
      (id) => crawlProduct(id, trentaSkus)
    );
    const products = results.filter((p): p is Product => p !== null);

    const failedCount = productIds.length - products.length;
    if (failedCount > 0) {
      logger.warn(`⚠️ ${failedCount} products could not be extracted`);
    }

    await writeProductsToJson(products, "starbucks");
  } catch (error) {
    logger.error("Starbucks crawler failed:", error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runStarbucksCrawler().catch((error) => {
    logger.error("Crawler execution failed:", error);
    process.exit(1);
  });
}
