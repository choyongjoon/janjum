import fs from "node:fs";
import path from "node:path";
import { PlaywrightCrawler } from "crawlee";
import type { Locator, Page } from "playwright";
import { logger } from "../../shared/logger";
import type { Nutritions } from "../../shared/nutritions";
import {
  type Product,
  waitFor,
  waitForLoad,
  writeProductsToJson,
} from "./crawlerUtils";

// ================================================
// SITE STRUCTURE CONFIGURATION
// ================================================

const SITE_CONFIG = {
  baseUrl: "https://www.lotteeatz.com",
  brandPage: "https://www.lotteeatz.com/brand/angel",
  brandCode: "ANGELINUS",
} as const;

const DEFAULT_CATEGORY = "기타";

// Product codes appear as `goBrandDetail('REP_000123')`, as
// `/products/introductions/REP_000123` hrefs, or as data attributes depending
// on how the brand page renders. Match the code itself rather than any single
// wrapper so a markup change doesn't break discovery.
const REP_CODE_REGEX = /REP_\w+/;
const REP_CODE_GLOBAL_REGEX = /REP_\w+/g;

const BG_IMAGE_URL_REGEX = /url\(([^)]+)\)/;
const SURROUNDING_QUOTES_REGEX = /^["']|["']$/g;
const IMAGE_DIMS_SUFFIX_REGEX = /\/dims\/.+$/;
const PRICE_REGEX = /[\d,]+/;
const NON_NUMERIC_REGEX = /[^\d.]/g;
const COMMA_REGEX = /,/g;

// Attributes that can carry a product code on the brand page.
const REP_CODE_ATTRIBUTES = [
  "href",
  "onclick",
  "data-rep-code",
  "data-repcode",
  "data-code",
] as const;

const PRODUCT_LINK_SELECTOR = [
  'a[href*="/products/introductions/"]',
  '[onclick*="goBrandDetail"]',
  "[data-rep-code]",
  "[data-repcode]",
].join(", ");

// Scanning is scoped to the product list when one of these matches, so
// unrelated links (banners, other Lotte brands) aren't picked up.
const PRODUCT_LIST_SELECTORS = [
  "#productList",
  ".prod-list",
  '[class*="prod-list"]',
  '[class*="product-list"]',
  '[class*="menu-list"]',
  '[class*="menu-grid"]',
] as const;

// Tried in order; the first selector that matches anything wins.
const CATEGORY_TAB_SELECTORS = [
  "#categoryList .tab-item",
  "#categoryList li",
  '[class*="category"] [class*="tab-item"]',
  '[class*="category"] .swiper-slide',
  ".tab-wrap .tab-item",
  ".tab-list li",
  '[role="tablist"] [role="tab"]',
] as const;

const CATEGORY_LABEL_SELECTORS = [".tab-text", ".txt", "a", "button"] as const;

const LOAD_MORE_SELECTORS = [
  ".btn-more:visible",
  ".more-btn:visible",
  'button:has-text("더보기"):visible',
  'a:has-text("더보기"):visible',
] as const;

const NAME_SELECTORS = [
  ".prod-detail-header .prod-tit",
  ".prod-tit",
  ".cont-prod-detail .tit",
  ".prod-detail-header h1",
  ".prod-detail-header h2",
] as const;

const IMAGE_SELECTORS = [
  ".cont-prod-detail .thumb-img",
  ".prod-detail-header .thumb-img",
  ".thumb-img",
  ".cont-prod-detail .prod-img img",
  ".cont-prod-detail img",
] as const;

const DESCRIPTION_SELECTORS = [
  "p.btext",
  ".prod-detail-header .btext",
  ".cont-prod-detail .desc",
  ".prod-desc",
] as const;

const PRICE_SELECTORS = [
  ".cont-prod-detail .prod-price .val",
  ".prod-price .val",
  ".prod-price",
  ".price .val",
] as const;

const NUTRITION_TABLE_SELECTORS = [
  "table.tbl-row-info",
  ".tbl-row-info",
  ".prod-nutrition table",
  ".cont-prod-detail table",
  "table",
] as const;

// ================================================
// CRAWLER CONFIGURATION
// ================================================

const isTestMode = process.env.CRAWLER_TEST_MODE === "true";
const maxProductsInTestMode = isTestMode
  ? Number.parseInt(process.env.CRAWLER_MAX_PRODUCTS ?? "3", 10)
  : Number.POSITIVE_INFINITY;

const PRODUCT_RENDER_TIMEOUT_MS = 20_000;
const RENDER_POLL_INTERVAL_MS = 250;
const TAB_SETTLE_MS = 1500;
const MAX_LOAD_MORE_CLICKS = 30;

const CRAWLER_CONFIG = {
  maxConcurrency: 3,
  maxRequestsPerCrawl: isTestMode ? 15 : 500,
  maxRequestRetries: 2,
  requestHandlerTimeoutSecs: isTestMode ? 60 : 180,
  navigationTimeoutSecs: 45,
  launchOptions: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  },
};

// ================================================
// HELPERS
// ================================================

function extractRepCode(value: string): string | null {
  return value.match(REP_CODE_REGEX)?.[0] ?? null;
}

function toAbsoluteUrl(url: string): string {
  if (!url || url.startsWith("http")) {
    return url;
  }
  if (url.startsWith("//")) {
    return `https:${url}`;
  }
  return `${SITE_CONFIG.baseUrl}${url.startsWith("/") ? "" : "/"}${url}`;
}

function normalizeImageUrl(raw: string): string {
  const inUrl = raw.match(BG_IMAGE_URL_REGEX)?.[1] ?? raw;
  const cleaned = inUrl.trim().replace(SURROUNDING_QUOTES_REGEX, "");
  if (!cleaned || cleaned === "none") {
    return "";
  }
  // Strip the cloudinary/dims resizing suffix to get the original image
  return toAbsoluteUrl(cleaned.replace(IMAGE_DIMS_SUFFIX_REGEX, ""));
}

function parsePrice(text: string): number | null {
  const m = text.match(PRICE_REGEX);
  if (!m) {
    return null;
  }
  const parsed = Number.parseInt(m[0].replace(COMMA_REGEX, ""), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function buildProductUrl(repCode: string): string {
  return `${SITE_CONFIG.baseUrl}/products/introductions/${repCode}?rccode=brnd_main&brandCode=${SITE_CONFIG.brandCode}`;
}

async function firstMatchingSelector(
  page: Page,
  selectors: readonly string[]
): Promise<string | null> {
  for (const selector of selectors) {
    if ((await page.locator(selector).count()) > 0) {
      return selector;
    }
  }
  return null;
}

async function firstMatching(
  page: Page,
  selectors: readonly string[]
): Promise<Locator | null> {
  const selector = await firstMatchingSelector(page, selectors);
  return selector ? page.locator(selector).first() : null;
}

async function readMetaContent(page: Page, selector: string): Promise<string> {
  const meta = page.locator(selector).first();
  if ((await meta.count()) === 0) {
    return "";
  }
  return (await meta.getAttribute("content"))?.trim() ?? "";
}

/**
 * Dump the rendered page so a structure change can be diagnosed from CI
 * artifacts instead of guessing from a bare "0 products" failure.
 */
async function dumpPageForDebugging(page: Page): Promise<void> {
  try {
    const outputDir = path.join(
      process.cwd(),
      "actors",
      "crawler",
      "crawler-outputs"
    );
    fs.mkdirSync(outputDir, { recursive: true });
    const filepath = path.join(outputDir, "angelinus-brand-page-debug.html");
    fs.writeFileSync(filepath, await page.content(), "utf8");
    logger.info(`Wrote brand page HTML for debugging: ${filepath}`);
  } catch (error) {
    logger.warn(
      `Could not dump brand page HTML: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ================================================
// BRAND PAGE: DISCOVER PRODUCTS
// ================================================

interface DiscoveredProduct {
  categoryName: string;
  repCode: string;
}

/**
 * The brand page renders its product grid client side, so wait for real
 * product markup instead of a fixed delay. Product codes also appear in the
 * page's embedded JSON state, so waiting on the raw HTML would return before
 * the grid exists.
 */
async function waitForProductsToRender(page: Page): Promise<boolean> {
  try {
    await page.waitForFunction(
      (selector) => document.querySelector(selector) !== null,
      PRODUCT_LINK_SELECTOR,
      { timeout: PRODUCT_RENDER_TIMEOUT_MS, polling: RENDER_POLL_INTERVAL_MS }
    );
    return true;
  } catch {
    logger.warn(
      `No product links rendered within ${PRODUCT_RENDER_TIMEOUT_MS}ms`
    );
    return false;
  }
}

/**
 * Collect every attribute value under `scope` that may contain a product code.
 */
async function collectRepCodeCandidates(
  page: Page,
  scope: string
): Promise<string[]> {
  return await page.evaluate(
    ({ scope: root, selector, attributes }) => {
      const matched = Array.from(document.querySelectorAll(root));
      const containers = matched.length > 0 ? matched : [document.body];
      const values: string[] = [];
      for (const container of containers) {
        for (const el of Array.from(container.querySelectorAll(selector))) {
          for (const attribute of attributes) {
            const value = el.getAttribute(attribute);
            if (value) {
              values.push(value);
            }
          }
        }
      }
      return values;
    },
    {
      scope,
      selector: PRODUCT_LINK_SELECTOR,
      attributes: REP_CODE_ATTRIBUTES as readonly string[],
    }
  );
}

/**
 * Prefer the product list container so unrelated links (banners, other Lotte
 * brands) aren't picked up, but fall back to the whole page if scoping finds
 * nothing.
 */
async function scrapeRepCodes(page: Page): Promise<string[]> {
  const scope =
    (await firstMatchingSelector(page, PRODUCT_LIST_SELECTORS)) ?? "body";

  let candidates = await collectRepCodeCandidates(page, scope);
  if (candidates.length === 0 && scope !== "body") {
    candidates = await collectRepCodeCandidates(page, "body");
  }

  const codes: string[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const code = extractRepCode(candidate);
    if (code && !seen.has(code)) {
      seen.add(code);
      codes.push(code);
    }
  }

  return codes;
}

/** Last resort: scan the raw HTML when no known product markup matches. */
async function scrapeRepCodesFromHtml(page: Page): Promise<string[]> {
  const html = await page.content();
  return Array.from(new Set(html.match(REP_CODE_GLOBAL_REGEX) ?? []));
}

async function expandLoadMore(page: Page): Promise<void> {
  for (let i = 0; i < MAX_LOAD_MORE_CLICKS; i++) {
    const button = await firstMatching(page, LOAD_MORE_SELECTORS);
    if (!(button && (await button.isEnabled().catch(() => false)))) {
      return;
    }
    await button.click().catch(() => {
      // The button can disappear between the check and the click
    });
    await waitFor(TAB_SETTLE_MS);
  }
  logger.warn(
    `Stopped expanding after ${MAX_LOAD_MORE_CLICKS} "더보기" clicks`
  );
}

async function findCategoryTabs(page: Page): Promise<Locator[]> {
  for (const selector of CATEGORY_TAB_SELECTORS) {
    const items = await page.locator(selector).all();
    if (items.length > 0) {
      logger.info(`Category tabs matched "${selector}" (${items.length} tabs)`);
      return items;
    }
  }
  return [];
}

async function readCategoryLabel(tab: Locator): Promise<string> {
  for (const selector of CATEGORY_LABEL_SELECTORS) {
    const label = tab.locator(selector).first();
    if ((await label.count()) > 0) {
      const text = (await label.textContent())?.trim();
      if (text) {
        return text;
      }
    }
  }
  return (await tab.textContent())?.trim() || DEFAULT_CATEGORY;
}

function addDiscovered(
  codes: string[],
  categoryName: string,
  discovered: DiscoveredProduct[],
  seenCodes: Set<string>
): void {
  for (const repCode of codes) {
    if (seenCodes.has(repCode)) {
      continue;
    }
    seenCodes.add(repCode);
    discovered.push({ repCode, categoryName });
  }
}

async function discoverByCategory(page: Page): Promise<DiscoveredProduct[]> {
  const discovered: DiscoveredProduct[] = [];
  const seenCodes = new Set<string>();
  const tabs = await findCategoryTabs(page);

  if (tabs.length === 0) {
    logger.warn("No category tabs matched — scanning the page as one category");
    await expandLoadMore(page);
    addDiscovered(
      await scrapeRepCodes(page),
      DEFAULT_CATEGORY,
      discovered,
      seenCodes
    );
    return discovered;
  }

  const tabsToProcess = isTestMode ? tabs.slice(0, 2) : tabs;

  for (const tab of tabsToProcess) {
    const categoryName = await readCategoryLabel(tab);
    logger.info(`Processing category: ${categoryName}`);

    await tab.click().catch(() => {
      logger.warn(`Could not click category tab: ${categoryName}`);
    });
    await waitFor(TAB_SETTLE_MS);
    await expandLoadMore(page);

    const codes = await scrapeRepCodes(page);
    const before = discovered.length;
    addDiscovered(codes, categoryName, discovered, seenCodes);
    logger.info(
      `  Found ${codes.length} products (${discovered.length - before} new) in ${categoryName}`
    );

    if (isTestMode && discovered.length >= maxProductsInTestMode) {
      logger.info(`Test mode: stopping at ${maxProductsInTestMode} products`);
      break;
    }
  }

  return discovered;
}

async function discoverProductsFromBrandPage(
  page: Page
): Promise<DiscoveredProduct[]> {
  await waitForLoad(page);
  await waitForProductsToRender(page);

  let discovered = await discoverByCategory(page);

  if (discovered.length === 0) {
    logger.warn(
      "No products found via product markup — falling back to a raw HTML scan"
    );
    discovered = (await scrapeRepCodesFromHtml(page)).map((repCode) => ({
      repCode,
      categoryName: DEFAULT_CATEGORY,
    }));
  }

  if (discovered.length === 0) {
    await dumpPageForDebugging(page);
    return discovered;
  }

  return isTestMode ? discovered.slice(0, maxProductsInTestMode) : discovered;
}

// ================================================
// PRODUCT DETAIL PAGE EXTRACTION
// ================================================

function applyNutritionValue(
  nutrition: Nutritions,
  label: string,
  value: string
): void {
  const num = Number.parseFloat(value.replace(NON_NUMERIC_REGEX, ""));
  if (Number.isNaN(num)) {
    return;
  }

  if (label.includes("총중량") || label.includes("제공량")) {
    nutrition.servingSize = num;
    nutrition.servingSizeUnit = value.includes("ml") ? "ml" : "g";
  } else if (label.includes("열량") || label.includes("칼로리")) {
    nutrition.calories = num;
    nutrition.caloriesUnit = "kcal";
  } else if (label.includes("탄수화물")) {
    nutrition.carbohydrates = num;
    nutrition.carbohydratesUnit = "g";
  } else if (label.includes("당류")) {
    nutrition.sugar = num;
    nutrition.sugarUnit = "g";
  } else if (label.includes("단백질")) {
    nutrition.protein = num;
    nutrition.proteinUnit = "g";
  } else if (label.includes("포화지방")) {
    nutrition.saturatedFat = num;
    nutrition.saturatedFatUnit = "g";
  } else if (label.includes("트랜스")) {
    nutrition.transFat = num;
    nutrition.transFatUnit = "g";
  } else if (label.includes("지방")) {
    nutrition.fat = num;
    nutrition.fatUnit = "g";
  } else if (label.includes("나트륨")) {
    nutrition.natrium = num;
    nutrition.natriumUnit = "mg";
  } else if (label.includes("콜레스테롤")) {
    nutrition.cholesterol = num;
    nutrition.cholesterolUnit = "mg";
  } else if (label.includes("카페인")) {
    nutrition.caffeine = num;
    nutrition.caffeineUnit = "mg";
  }
}

type LabelledValue = [label: string, value: string];

/**
 * Read a nutrition table as label/value pairs, supporting both the vertical
 * layout (one row per nutrient) and the horizontal one (a header row of
 * labels followed by a row of values).
 *
 * Note: the callback runs in the browser, so it must not declare named
 * function expressions — tsx/esbuild rewrites those into `__name(...)` calls
 * that don't exist on the page.
 */
async function readTablePairs(table: Locator): Promise<LabelledValue[]> {
  return await table.evaluate((el) => {
    const rows: string[][] = [];
    for (const row of Array.from(el.querySelectorAll("tr"))) {
      rows.push(
        Array.from(row.querySelectorAll("th, td")).map((cell) =>
          (cell.textContent ?? "").trim()
        )
      );
    }

    const vertical: [string, string][] = [];
    for (const cells of rows) {
      if (cells.length === 2) {
        vertical.push([cells[0], cells[1]]);
      }
    }
    if (vertical.length > 0) {
      return vertical;
    }

    const horizontal: [string, string][] = [];
    for (let i = 0; i + 1 < rows.length; i += 2) {
      const labels = rows[i];
      const values = rows[i + 1];
      if (labels.length !== values.length) {
        continue;
      }
      for (const [index, label] of labels.entries()) {
        horizontal.push([label, values[index]]);
      }
    }
    return horizontal;
  });
}

async function extractNutritionFromTable(
  page: Page
): Promise<Nutritions | null> {
  for (const selector of NUTRITION_TABLE_SELECTORS) {
    const table = page.locator(selector).first();
    if ((await table.count()) === 0) {
      continue;
    }

    const nutrition: Nutritions = {};
    for (const [label, value] of await readTablePairs(table)) {
      if (label && value) {
        applyNutritionValue(nutrition, label, value);
      }
    }

    if (Object.keys(nutrition).length > 0) {
      return nutrition;
    }
  }

  return null;
}

async function extractName(page: Page): Promise<string> {
  const nameEl = await firstMatching(page, NAME_SELECTORS);
  if (nameEl) {
    // Prefer the element's own text nodes so nested controls (the bookmark
    // button, badges) don't leak into the product name.
    const ownText = await nameEl.evaluate((el) =>
      Array.from(el.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent ?? "")
        .join("")
        .trim()
    );
    if (ownText) {
      return ownText;
    }
    const fullText = (await nameEl.textContent())?.trim();
    if (fullText) {
      return fullText;
    }
  }

  return await readMetaContent(page, 'meta[property="og:title"]');
}

async function extractImageUrl(page: Page): Promise<string> {
  const imageEl = await firstMatching(page, IMAGE_SELECTORS);
  if (imageEl) {
    const raw = await imageEl.evaluate((el) => {
      if (el instanceof HTMLImageElement) {
        return el.currentSrc || el.src || el.getAttribute("data-src") || "";
      }
      const computed = window.getComputedStyle(el).backgroundImage;
      return computed && computed !== "none"
        ? computed
        : (el.getAttribute("style") ?? "");
    });
    const url = normalizeImageUrl(raw);
    if (url) {
      return url;
    }
  }

  return normalizeImageUrl(
    await readMetaContent(page, 'meta[property="og:image"]')
  );
}

async function extractDescription(page: Page): Promise<string | null> {
  const descEl = await firstMatching(page, DESCRIPTION_SELECTORS);
  if (descEl) {
    const text = (await descEl.textContent())?.trim();
    if (text) {
      return text;
    }
  }

  return (
    (await readMetaContent(page, 'meta[property="og:description"]')) || null
  );
}

async function extractPrice(page: Page): Promise<number | null> {
  const priceEl = await firstMatching(page, PRICE_SELECTORS);
  if (!priceEl) {
    return null;
  }
  const text = (await priceEl.textContent())?.trim() ?? "";
  return text ? parsePrice(text) : null;
}

async function extractProductFromDetailPage(
  page: Page,
  repCode: string,
  categoryName: string
): Promise<Product | null> {
  await waitForLoad(page);
  await waitFor(1000);

  const name = await extractName(page);
  if (!name) {
    logger.warn(`No product name found for ${repCode}`);
    return null;
  }

  return {
    name,
    nameEn: null,
    description: await extractDescription(page),
    price: await extractPrice(page),
    externalImageUrl: await extractImageUrl(page),
    category: null,
    externalCategory: categoryName,
    externalId: `angelinus_${repCode}`,
    externalUrl: buildProductUrl(repCode),
    nutritions: await extractNutritionFromTable(page),
  };
}

// ================================================
// PAGE HANDLERS
// ================================================

async function handleBrandPage(
  page: Page,
  crawlerInstance: PlaywrightCrawler
): Promise<void> {
  const products = await discoverProductsFromBrandPage(page);
  logger.info(`Discovered ${products.length} products across all categories`);

  if (products.length === 0) {
    logger.error("No products found on brand page");
    return;
  }

  await crawlerInstance.addRequests(
    products.map(({ repCode, categoryName }) => ({
      url: buildProductUrl(repCode),
      userData: { isProductPage: true, repCode, categoryName },
    }))
  );
}

async function handleProductPage(
  page: Page,
  request: { url: string; userData: { repCode: string; categoryName: string } },
  crawlerInstance: PlaywrightCrawler
): Promise<void> {
  const { repCode, categoryName } = request.userData;
  const product = await extractProductFromDetailPage(
    page,
    repCode,
    categoryName
  );

  if (product) {
    await crawlerInstance.pushData(product);
    logger.info(
      `Saved: ${product.name} [${product.externalCategory}]${product.nutritions ? " +nutrition" : ""}${product.price ? ` (${product.price}원)` : ""}`
    );
  }
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const createAngelinusCrawler = () =>
  new PlaywrightCrawler({
    launchContext: { launchOptions: CRAWLER_CONFIG.launchOptions },
    async requestHandler({ page, crawler: crawlerInstance, request }) {
      if (request.userData?.isProductPage) {
        await handleProductPage(
          page,
          request as typeof request & {
            userData: { repCode: string; categoryName: string };
          },
          crawlerInstance
        );
      } else {
        await handleBrandPage(page, crawlerInstance);
      }
    },
    failedRequestHandler({ request, error }) {
      logger.error(
        `Request failed: ${request.url} - ${error instanceof Error ? error.message : String(error)}`
      );
    },
    maxConcurrency: CRAWLER_CONFIG.maxConcurrency,
    maxRequestsPerCrawl: CRAWLER_CONFIG.maxRequestsPerCrawl,
    maxRequestRetries: CRAWLER_CONFIG.maxRequestRetries,
    requestHandlerTimeoutSecs: CRAWLER_CONFIG.requestHandlerTimeoutSecs,
    navigationTimeoutSecs: CRAWLER_CONFIG.navigationTimeoutSecs,
  });

export const runAngelinusCrawler = async () => {
  const crawler = createAngelinusCrawler();

  try {
    await crawler.run([SITE_CONFIG.brandPage]);
    const dataset = await crawler.getData();

    if (dataset.items.length === 0) {
      throw new Error("No products extracted for angelinus");
    }

    await writeProductsToJson(dataset.items as Product[], "angelinus");
    await crawler.teardown();
  } catch (error) {
    logger.error("Angelinus crawler failed:", error);
    throw error;
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runAngelinusCrawler()
    .then(() => {
      logger.info("Crawler completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      logger.error("Crawler execution failed:", error);
      process.exit(1);
    });
}
