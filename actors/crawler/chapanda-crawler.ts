import { PlaywrightCrawler } from "crawlee";
import type { Locator, Page } from "playwright";
import { logger } from "../../shared/logger";
import { type Product, waitForLoad, writeProductsToJson } from "./crawlerUtils";

// ================================================
// SITE STRUCTURE CONFIGURATION
// ================================================

// The brand homepage (kr.chapanda.com) is a Next.js app whose "제품 라인업"
// section server-renders every product up front: four category panels are all
// present in the DOM (only one is visible at a time via `data-status`), so we
// can read all of them without clicking through the tabs.
//
// ChaPanda does not publish nutrition data on its Korean site, so every product
// is stored with `nutritions: null` (same as the Oozy crawler).
const SITE_CONFIG = {
  baseUrl: "https://kr.chapanda.com",
  startUrl: "https://kr.chapanda.com/",
  // Category labels in DOM order, matching the lineup tab buttons.
  categories: [
    "프레시 프루트",
    "프레시 밀크티",
    "오리지널 밀크티",
    "프레시 티",
  ],
} as const;

// ================================================
// CSS SELECTORS
// ================================================

const SELECTORS = {
  // Each category is a server-rendered grid panel tagged with data-status.
  categoryPanel: "[data-status]",
  // Direct children of a panel are individual product cells.
  productCell: ":scope > div",
  // The product photo is the first <img> in a cell (a sales badge may follow).
  productImage: "img",
  // Product name caption.
  productName: "p.text-center.font-medium",
} as const;

// ================================================
// CRAWLER CONFIGURATION
// ================================================

const isTestMode = process.env.CRAWLER_TEST_MODE === "true";
const maxProductsInTestMode = isTestMode
  ? Number.parseInt(process.env.CRAWLER_MAX_PRODUCTS || "3", 10)
  : Number.POSITIVE_INFINITY;
const maxRequestsInTestMode = isTestMode
  ? Number.parseInt(process.env.CRAWLER_MAX_REQUESTS || "10", 10)
  : 50;

const CRAWLER_CONFIG = {
  maxConcurrency: isTestMode
    ? 2
    : Number.parseInt(process.env.CRAWLER_MAX_CONCURRENCY || "5", 10),
  maxRequestsPerCrawl: isTestMode ? maxRequestsInTestMode : 100,
  maxRequestRetries: 2,
  requestHandlerTimeoutSecs: isTestMode ? 20 : 40,
  launchOptions: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  },
};

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

// Drop the OSS image-processing query (`?x-oss-process=...`) so we keep the
// original, full-resolution image instead of a resized/recompressed variant.
function cleanImageUrl(src: string): string {
  const queryIndex = src.indexOf("?");
  return queryIndex === -1 ? src : src.slice(0, queryIndex);
}

async function extractProductFromCell(
  cell: Locator,
  category: string,
  pageUrl: string
): Promise<Product | null> {
  const name = (
    await cell
      .locator(SELECTORS.productName)
      .first()
      .textContent()
      .catch(() => "")
  )?.trim();

  if (!name) {
    return null;
  }

  const rawSrc =
    (await cell
      .locator(SELECTORS.productImage)
      .first()
      .getAttribute("src")
      .catch(() => "")) || "";

  return {
    name,
    nameEn: null,
    description: null,
    price: null,
    externalImageUrl: rawSrc ? cleanImageUrl(rawSrc) : "",
    category,
    externalCategory: category,
    externalId: `chapanda_${category}_${name}`,
    externalUrl: pageUrl,
    nutritions: null,
  };
}

async function extractProductsFromPanel(
  panel: Locator,
  category: string,
  pageUrl: string
): Promise<Product[]> {
  const cells = await panel.locator(SELECTORS.productCell).all();
  const cellsToProcess = isTestMode
    ? cells.slice(0, maxProductsInTestMode)
    : cells;

  logger.info(`Category "${category}": found ${cells.length} cells`);

  const results = await Promise.all(
    cellsToProcess.map((cell) =>
      extractProductFromCell(cell, category, pageUrl).catch((error) => {
        logger.debug(`Failed to extract product: ${error}`);
        return null;
      })
    )
  );

  return results.filter((product): product is Product => product !== null);
}

function dedupeProducts(products: Product[]): Product[] {
  const seenIds = new Set<string>();
  const unique: Product[] = [];

  for (const product of products) {
    if (!seenIds.has(product.externalId)) {
      seenIds.add(product.externalId);
      unique.push(product);
      logger.info(`Extracted: ${product.name} (${product.category})`);
    }
  }

  return unique;
}

async function extractProductsFromPage(page: Page): Promise<Product[]> {
  await waitForLoad(page);

  try {
    await page.waitForSelector(SELECTORS.categoryPanel, { timeout: 15_000 });
  } catch {
    logger.warn("Category panels not found within timeout");
    return [];
  }

  // Give hydration a moment to settle the lineup section.
  await page.waitForTimeout(2000);

  const panels = await page.locator(SELECTORS.categoryPanel).all();
  logger.info(`Found ${panels.length} category panels`);

  if (panels.length === 0) {
    logger.warn("No category panels found");
    return [];
  }

  const pageUrl = page.url();
  const perPanel = await Promise.all(
    panels.map((panel, index) =>
      extractProductsFromPanel(
        panel,
        SITE_CONFIG.categories[index] ?? `기타 ${index + 1}`,
        pageUrl
      )
    )
  );

  return dedupeProducts(perPanel.flat());
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const createChapandaCrawler = () =>
  new PlaywrightCrawler({
    launchContext: {
      launchOptions: CRAWLER_CONFIG.launchOptions,
    },
    async requestHandler({ page, crawler: crawlerInstance }) {
      logger.info("Processing ChaPanda product lineup");

      const products = await extractProductsFromPage(page);

      await Promise.all(
        products.map((product) => crawlerInstance.pushData(product))
      );

      logger.info(`Added ${products.length} products`);
    },
    maxConcurrency: CRAWLER_CONFIG.maxConcurrency,
    maxRequestsPerCrawl: CRAWLER_CONFIG.maxRequestsPerCrawl,
    maxRequestRetries: CRAWLER_CONFIG.maxRequestRetries,
    requestHandlerTimeoutSecs: CRAWLER_CONFIG.requestHandlerTimeoutSecs,
  });

export const runChapandaCrawler = async () => {
  const crawler = createChapandaCrawler();

  try {
    await crawler.run([SITE_CONFIG.startUrl]);
    const dataset = await crawler.getData();
    await writeProductsToJson(dataset.items as Product[], "chapanda");
  } catch (error) {
    logger.error("Chapanda crawler failed:", error);
    throw error;
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runChapandaCrawler().catch((error) => {
    logger.error("Crawler execution failed:", error);
    process.exit(1);
  });
}
