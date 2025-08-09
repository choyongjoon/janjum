import { PlaywrightCrawler } from 'crawlee';
import type { Locator, Page } from 'playwright';
import { logger } from '../../shared/logger';
import {
  type Product,
  takeDebugScreenshot,
  waitForLoad,
  writeProductsToJson,
} from './crawlerUtils';

// ================================================
// SITE STRUCTURE CONFIGURATION
// ================================================

const SITE_CONFIG = {
  baseUrl: 'https://www.baristapaulbassett.co.kr',
  startUrl: 'https://www.baristapaulbassett.co.kr/menu/List.pb',
  categoryUrls: [
    'https://www.baristapaulbassett.co.kr/menu/List.pb?cid1=A', // COFFEE
    'https://www.baristapaulbassett.co.kr/menu/List.pb?cid1=B', // BEVERAGE
    'https://www.baristapaulbassett.co.kr/menu/List.pb?cid1=C', // ICE-CREAM
    'https://www.baristapaulbassett.co.kr/menu/List.pb?cid1=D', // FOOD
    'https://www.baristapaulbassett.co.kr/menu/List.pb?cid1=E', // PRODUCT
  ],
} as const;

// ================================================
// CSS SELECTORS
// ================================================

const SELECTORS = {
  // Product listing selectors - simplified to working selector
  productItems: 'ul li:has(img[src*="/upload/product/"])',

  // Product data selectors
  productData: {
    nameContainer: '.txtArea',
    nameEn: '.txtArea .sTxt',
    image: 'img',
  },
} as const;

// ================================================
// CRAWLER CONFIGURATION
// ================================================

// Test mode configuration
const isTestMode = process.env.CRAWLER_TEST_MODE === 'true';
const maxProductsInTestMode = isTestMode
  ? Number.parseInt(process.env.CRAWLER_MAX_PRODUCTS || '3', 10)
  : Number.POSITIVE_INFINITY;
const maxRequestsInTestMode = isTestMode
  ? Number.parseInt(process.env.CRAWLER_MAX_REQUESTS || '10', 10)
  : 100;

const CRAWLER_CONFIG = {
  maxConcurrency: 3,
  maxRequestsPerCrawl: isTestMode ? maxRequestsInTestMode : 100,
  maxRequestRetries: 2,
  requestHandlerTimeoutSecs: isTestMode ? 20 : 30,
  launchOptions: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
};

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

// Regular expressions defined at module level for performance
const EXTERNAL_ID_REGEX = /[^\w-]/g;

// Map category IDs to category names and types
const CATEGORY_MAP = {
  A: { name: 'COFFEE', type: 'Coffee' },
  B: { name: 'BEVERAGE', type: 'Beverage' },
  C: { name: 'ICE-CREAM', type: 'Dessert' },
  D: { name: 'FOOD', type: 'Food' },
  E: { name: 'PRODUCT', type: 'Product' },
  default: { name: 'COFFEE', type: 'Coffee' },
} as const;

function getCategoryFromUrl(url: string): { name: string; type: string } {
  const urlObj = new URL(url);
  const cid1 = urlObj.searchParams.get('cid1');
  return (
    CATEGORY_MAP[cid1 as keyof typeof CATEGORY_MAP] || CATEGORY_MAP.default
  );
}

async function extractProductFromItem(
  item: Locator,
  pageUrl: string
): Promise<Product | null> {
  try {
    // Extract Korean name from the main text area (excluding the English span)
    const nameContainerElement = item
      .locator(SELECTORS.productData.nameContainer)
      .first();
    const fullNameText = await nameContainerElement
      .textContent()
      .then((text) => text?.trim() || '')
      .catch(() => '');

    // Extract English name from the span element
    const nameEnElement = item.locator(SELECTORS.productData.nameEn).first();
    const nameEn = await nameEnElement
      .textContent()
      .then((text) => text?.trim() || '')
      .catch(() => '');

    // Get Korean name by removing the English part from the full text
    const name = nameEn
      ? fullNameText.replace(nameEn, '').trim()
      : fullNameText;

    // Extract image src
    const imageSrc = await item
      .locator(SELECTORS.productData.image)
      .first()
      .getAttribute('src')
      .catch(() => '');

    // Check for status labels (New/Best)
    const fullText = (await item.textContent().catch(() => '')) || '';
    const hasNewLabel = fullText.includes('[New]') || fullText.includes('NEW');
    const hasBestLabel =
      fullText.includes('[Best]') || fullText.includes('BEST');

    if (!name || name.length <= 2) {
      return null; // Filter out empty or very short names
    }

    // Determine category from URL
    const categoryInfo = getCategoryFromUrl(pageUrl);

    let description = '';
    if (hasNewLabel) {
      description = 'New Product';
    } else if (hasBestLabel) {
      description = 'Best Seller';
    }

    const product: Product = {
      name: name || nameEn, // Use Korean as primary, fallback to English
      nameEn: nameEn || name, // Use English as primary, fallback to Korean
      description,
      externalCategory: categoryInfo.name,
      externalId: (nameEn || name)
        .replace(/\s+/g, '-')
        .toLowerCase()
        .replace(EXTERNAL_ID_REGEX, ''),
      externalImageUrl: imageSrc
        ? new URL(imageSrc, SITE_CONFIG.baseUrl).href
        : '',
      externalUrl: pageUrl,
      price: null,
      category: categoryInfo.type,
    };

    let statusInfo = '';
    if (hasNewLabel) {
      statusInfo = ' [New]';
    } else if (hasBestLabel) {
      statusInfo = ' [Best]';
    }
    logger.info(
      `✅ Extracted [${categoryInfo.name}]: ${product.name}${statusInfo}`
    );
    return product;
  } catch (error) {
    logger.warn(`Failed to extract data from product item: ${error}`);
    return null;
  }
}

async function extractProductsFromPage(page: Page): Promise<Product[]> {
  const pageUrl = page.url();

  try {
    const items = await page.locator(SELECTORS.productItems).all();
    logger.info(`Found ${items.length} product items`);

    const productPromises = items.map((item) =>
      extractProductFromItem(item, pageUrl)
    );
    const extractedProducts = await Promise.all(productPromises);
    const validProducts = extractedProducts.filter(
      (product): product is Product => product !== null
    );

    return validProducts;
  } catch (error) {
    logger.error(`Failed to extract products: ${error}`);
    return [];
  }
}

// ================================================
// PAGE HANDLERS
// ================================================

async function handleMenuPage(page: Page, crawlerInstance: PlaywrightCrawler) {
  logger.info('Processing Paul Bassett menu page');

  await waitForLoad(page);
  await takeDebugScreenshot(page, 'paulbassett-menu');

  const products = await extractProductsFromPage(page);
  logger.info(`Found ${products.length} products to process`);

  // Limit products in test mode
  const productsToProcess = isTestMode
    ? products.slice(0, maxProductsInTestMode)
    : products;

  if (isTestMode) {
    logger.info(
      `🧪 Test mode: limiting to ${productsToProcess.length} products`
    );
  }

  // Push all products directly to the crawler
  for (const product of productsToProcess) {
    await crawlerInstance.pushData(product);
  }

  logger.info(
    `Processed ${productsToProcess.length} products from Paul Bassett menu`
  );
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const createPaulBassettCrawler = () =>
  new PlaywrightCrawler({
    launchContext: {
      launchOptions: CRAWLER_CONFIG.launchOptions,
    },
    async requestHandler({ page, crawler: crawlerInstance }) {
      await handleMenuPage(page, crawlerInstance);
    },
    maxConcurrency: CRAWLER_CONFIG.maxConcurrency,
    maxRequestsPerCrawl: CRAWLER_CONFIG.maxRequestsPerCrawl,
    maxRequestRetries: CRAWLER_CONFIG.maxRequestRetries,
    requestHandlerTimeoutSecs: CRAWLER_CONFIG.requestHandlerTimeoutSecs,
  });

export const runPaulBassettCrawler = async () => {
  const crawler = createPaulBassettCrawler();

  try {
    // Crawl all categories to get complete product catalog
    const urlsToCrawl = isTestMode
      ? [SITE_CONFIG.startUrl]
      : SITE_CONFIG.categoryUrls;
    logger.info(
      `Crawling ${urlsToCrawl.length} category pages${isTestMode ? ' (test mode - main page only)' : ''}`
    );

    await crawler.run(urlsToCrawl);
    const dataset = await crawler.getData();
    await writeProductsToJson(dataset.items as Product[], 'paulbassett');
  } catch (error) {
    logger.error('Paul Bassett crawler failed:', error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runPaulBassettCrawler().catch((error) => {
    logger.error('Crawler execution failed:', error);
    process.exit(1);
  });
}
