import { PlaywrightCrawler } from 'crawlee';
import type { Page } from 'playwright';
import { logger } from '../../shared/logger';
import type { Nutritions } from '../../shared/nutritions';
import {
  type Product,
  waitFor,
  waitForLoad,
  writeProductsToJson,
} from './crawlerUtils';

// ================================================
// SITE STRUCTURE CONFIGURATION
// ================================================

const SITE_CONFIG = {
  baseUrl: 'https://www.lotteeatz.com',
  brandPage: 'https://www.lotteeatz.com/brand/angel',
  brandCode: 'ANGELINUS',
} as const;

const REP_CODE_REGEX = /goBrandDetail\('(REP_\w+)'\)/;
const BG_IMAGE_URL_REGEX = /url\(([^)]+)\)/;
const IMAGE_DIMS_SUFFIX_REGEX = /\/dims\/.+$/;
const PRICE_REGEX = /[\d,]+/;

// ================================================
// CRAWLER CONFIGURATION
// ================================================

const isTestMode = process.env.CRAWLER_TEST_MODE === 'true';
const maxProductsInTestMode = isTestMode
  ? Number.parseInt(process.env.CRAWLER_MAX_PRODUCTS ?? '3', 10)
  : Number.POSITIVE_INFINITY;

const CRAWLER_CONFIG = {
  maxConcurrency: 3,
  maxRequestsPerCrawl: isTestMode ? 15 : 500,
  maxRequestRetries: 2,
  requestHandlerTimeoutSecs: isTestMode ? 60 : 120,
  navigationTimeoutSecs: 30,
  launchOptions: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  },
};

// ================================================
// HELPERS
// ================================================

function extractRepCode(onclick: string): string | null {
  return onclick.match(REP_CODE_REGEX)?.[1] ?? null;
}

function extractBgImageUrl(style: string): string {
  const raw = style.match(BG_IMAGE_URL_REGEX)?.[1] ?? '';
  // Strip cloudinary/dims resizing suffix to get original image
  return raw.replace(IMAGE_DIMS_SUFFIX_REGEX, '');
}

function parsePrice(text: string): number | null {
  const m = text.match(PRICE_REGEX);
  if (!m) {
    return null;
  }
  return Number.parseInt(m[0].replace(/,/g, ''), 10);
}

function buildProductUrl(repCode: string): string {
  return `${SITE_CONFIG.baseUrl}/products/introductions/${repCode}?rccode=brnd_main&brandCode=${SITE_CONFIG.brandCode}`;
}

// ================================================
// BRAND PAGE: DISCOVER PRODUCTS
// ================================================

interface DiscoveredProduct {
  repCode: string;
  categoryName: string;
}

async function discoverProductsFromBrandPage(
  page: Page
): Promise<DiscoveredProduct[]> {
  await waitForLoad(page);
  await waitFor(2000); // Allow JS to fully render

  const discovered: DiscoveredProduct[] = [];
  const seenCodes = new Set<string>();

  // Get all category tabs: .tab-item elements, category name from .tab-text span
  const tabItems = await page.locator('#categoryList .tab-item').all();
  logger.info(`Found ${tabItems.length} category tabs`);

  const tabsToProcess = isTestMode ? tabItems.slice(0, 2) : tabItems;

  for (const tabItem of tabsToProcess) {
    const categoryName =
      (await tabItem.locator('.tab-text').textContent())?.trim() ?? '기타';

    logger.info(`Processing category: ${categoryName}`);

    // Click the tab to load its products
    await tabItem.click();
    await waitFor(1500);

    // Find all product links via goBrandDetail onclick
    const productLinks = await page
      .locator('#productList [onclick*="goBrandDetail"]')
      .all();

    logger.info(`  Found ${productLinks.length} products in ${categoryName}`);

    for (const link of productLinks) {
      const onclick = (await link.getAttribute('onclick')) ?? '';
      const repCode = extractRepCode(onclick);
      if (!repCode || seenCodes.has(repCode)) {
        continue;
      }
      seenCodes.add(repCode);
      discovered.push({ repCode, categoryName });

      if (isTestMode && discovered.length >= maxProductsInTestMode) {
        logger.info(`Test mode: stopping at ${maxProductsInTestMode} products`);
        return discovered;
      }
    }
  }

  return discovered;
}

// ================================================
// PRODUCT DETAIL PAGE EXTRACTION
// ================================================

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: each nutrition label requires its own branch
async function extractNutritionFromTable(
  page: Page
): Promise<Nutritions | null> {
  const rows = await page.locator('table.tbl-row-info tr').all();
  if (rows.length === 0) {
    return null;
  }

  const nutrition: Nutritions = {};

  for (const row of rows) {
    const label = (await row.locator('th').textContent())?.trim() ?? '';
    const value = (await row.locator('td').textContent())?.trim() ?? '';

    if (!(label && value)) {
      continue;
    }

    const num = Number.parseFloat(value.replace(/[^\d.]/g, ''));
    if (Number.isNaN(num)) {
      continue;
    }

    if (label.includes('총중량') || label.includes('제공량')) {
      nutrition.servingSize = num;
      nutrition.servingSizeUnit = value.includes('ml') ? 'ml' : 'g';
    } else if (label.includes('열량') || label.includes('칼로리')) {
      nutrition.calories = num;
      nutrition.caloriesUnit = 'kcal';
    } else if (label.includes('탄수화물')) {
      nutrition.carbohydrates = num;
      nutrition.carbohydratesUnit = 'g';
    } else if (label.includes('당류')) {
      nutrition.sugar = num;
      nutrition.sugarUnit = 'g';
    } else if (label.includes('단백질')) {
      nutrition.protein = num;
      nutrition.proteinUnit = 'g';
    } else if (label.includes('포화지방')) {
      nutrition.saturatedFat = num;
      nutrition.saturatedFatUnit = 'g';
    } else if (label.includes('트랜스')) {
      nutrition.transFat = num;
      nutrition.transFatUnit = 'g';
    } else if (label.includes('지방')) {
      nutrition.fat = num;
      nutrition.fatUnit = 'g';
    } else if (label.includes('나트륨')) {
      nutrition.natrium = num;
      nutrition.natriumUnit = 'mg';
    } else if (label.includes('콜레스테롤')) {
      nutrition.cholesterol = num;
      nutrition.cholesterolUnit = 'mg';
    } else if (label.includes('카페인')) {
      nutrition.caffeine = num;
      nutrition.caffeineUnit = 'mg';
    }
  }

  return Object.keys(nutrition).length > 0 ? nutrition : null;
}

async function extractProductFromDetailPage(
  page: Page,
  repCode: string,
  categoryName: string
): Promise<Product | null> {
  await waitForLoad(page);
  await waitFor(1000);

  // Name: .prod-tit text — must exclude the .chk-bookmark child
  const nameEl = page.locator('.prod-detail-header .prod-tit').first();
  if ((await nameEl.count()) === 0) {
    logger.warn(`No .prod-tit found for ${repCode}`);
    return null;
  }
  // Extract only the direct text node (excludes nested bookmark span)
  const name = await nameEl.evaluate((el) => {
    const textNodes = Array.from(el.childNodes).filter(
      (n) => n.nodeType === Node.TEXT_NODE
    );
    return textNodes
      .map((n) => n.textContent ?? '')
      .join('')
      .trim();
  });

  if (!name) {
    logger.warn(`Empty name for ${repCode}`);
    return null;
  }

  // Image: background-image from .thumb-img style
  const thumbStyle =
    (await page
      .locator('.cont-prod-detail .thumb-img')
      .first()
      .getAttribute('style')) ?? '';
  const externalImageUrl = extractBgImageUrl(thumbStyle);

  // Description: p.btext
  const descEl = page.locator('p.btext').first();
  const description =
    (await descEl.count()) > 0
      ? ((await descEl.textContent())?.trim() ?? null)
      : null;

  // Price: .prod-price .val
  const priceEl = page.locator('.cont-prod-detail .prod-price .val').first();
  const priceText =
    (await priceEl.count()) > 0
      ? ((await priceEl.textContent())?.trim() ?? '')
      : '';
  const price = priceText ? parsePrice(priceText) : null;

  // Nutrition from table
  const nutritions = await extractNutritionFromTable(page);

  return {
    name,
    nameEn: null,
    description,
    price,
    externalImageUrl,
    category: null,
    externalCategory: categoryName,
    externalId: `angelinus_${repCode}`,
    externalUrl: buildProductUrl(repCode),
    nutritions,
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
    logger.error('No products found on brand page');
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
      `Saved: ${product.name} [${product.externalCategory}]${product.nutritions ? ' +nutrition' : ''}${product.price ? ` (${product.price}원)` : ''}`
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
      throw new Error('No products extracted for angelinus');
    }

    await writeProductsToJson(dataset.items as Product[], 'angelinus');
    await crawler.teardown();
  } catch (error) {
    logger.error('Angelinus crawler failed:', error);
    throw error;
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runAngelinusCrawler()
    .then(() => {
      logger.info('Crawler completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Crawler execution failed:', error);
      process.exit(1);
    });
}
