import { PlaywrightCrawler, type Request } from 'crawlee';
import type { Page } from 'playwright';
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
  baseUrl: 'https://www.starbucks.co.kr',
  startUrl: 'https://www.starbucks.co.kr/menu/drink_list.do',
  productUrlTemplate:
    'https://www.starbucks.co.kr/menu/drink_view.do?product_cd=',
} as const;

// ================================================
// CSS SELECTORS
// ================================================

const SELECTORS = {
  // Product listing page selectors
  productLinks: [
    'a.goDrinkView',
    'a[href*="drink_view.do"]',
    'a[href*="product_cd"]',
    '.product-item a',
    '.drink-item a',
    'a[onclick*="goDrinkView"]',
  ],

  // Product detail page selectors
  productDetails: {
    name: '.myAssignZone > h4',
    nameEn: '.myAssignZone > h4 > span',
    description: '.myAssignZone p.t1',
    category: '.cate',
    image: '.elevatezoom-gallery > img:first-child',
  },
} as const;

// ================================================
// REGEX PATTERNS
// ================================================

const PATTERNS = {
  productCode: /\[(\d+)\]/,
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
  : 200;

const CRAWLER_CONFIG = {
  maxConcurrency: 5, // Increased from 3 to 5
  maxRequestsPerCrawl: isTestMode ? maxRequestsInTestMode : 300, // Increased to 300 to handle all products (183 found + buffer)
  maxRequestRetries: 2,
  requestHandlerTimeoutSecs: isTestMode ? 20 : 45, // Increased timeout for better success rate
  launchOptions: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
};

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

async function extractProductData(page: Page): Promise<Product> {
  const [
    name,
    nameEn,
    description,
    externalCategory,
    externalImageUrl,
    externalId,
    externalUrl,
  ] = await Promise.all([
    page
      .locator(SELECTORS.productDetails.name)
      .textContent()
      .then((text) => text?.trim() || ''),
    page
      .locator(SELECTORS.productDetails.nameEn)
      .textContent()
      .then((text) => text?.trim() || ''),
    page
      .locator(SELECTORS.productDetails.description)
      .first()
      .textContent()
      .then((text) => text?.trim() || ''),
    page
      .locator(SELECTORS.productDetails.category)
      .textContent()
      .then((text) => text?.trim() || ''),
    page
      .locator(SELECTORS.productDetails.image)
      .first()
      .getAttribute('src')
      .catch(() => '')
      .then((src) => src || ''),
    Promise.resolve(page.url()).then((url) => {
      const urlParams = new URLSearchParams(new URL(url).search);
      return urlParams.get('product_cd') || '';
    }),
    Promise.resolve(page.url()),
  ]);

  // Clean Korean name by removing English part
  let cleanName = name;
  if (nameEn && name.includes(nameEn)) {
    cleanName = name.replace(nameEn, '').trim();
  }

  return {
    name: cleanName,
    nameEn,
    description,
    externalCategory,
    externalId,
    externalImageUrl,
    externalUrl,
    price: null,
    category: 'Drinks',
  };
}

function extractProductIdFromLink(
  href: string,
  onclick: string,
  innerHTML: string
): string[] {
  const extractedIds: string[] = [];

  // Try to extract product ID from href
  if (href?.includes('drink_view.do')) {
    const match = href.match(PATTERNS.productCode);
    if (match) {
      extractedIds.push(match[1]);
    }
  }

  // Try to extract product ID from onclick
  if (onclick?.includes('product_cd')) {
    const match = onclick.match(PATTERNS.productCode);
    if (match) {
      extractedIds.push(match[1]);
    }
  }

  // Extract product ID from image src in innerHTML
  if (innerHTML) {
    const imgMatch = innerHTML.match(PATTERNS.productCode);
    if (imgMatch) {
      extractedIds.push(imgMatch[1]);
    }
  }

  return extractedIds;
}

async function extractProductIds(page: Page) {
  let links: ReturnType<typeof page.locator> | null = null;
  let usedSelector = '';

  // Try each selector until we find one that works
  const selectorPromises = SELECTORS.productLinks.map(async (selector) => {
    const foundLinks = page.locator(selector);
    const count = await foundLinks.count();
    return { selector, foundLinks, count };
  });

  const selectorResults = await Promise.all(selectorPromises);
  for (const result of selectorResults) {
    if (result.count > 0) {
      links = result.foundLinks;
      usedSelector = result.selector;
      break;
    }
  }

  const ids: string[] = [];
  let linksFound = 0;

  if (links) {
    linksFound = await links.count();

    // Process all links to extract product IDs in parallel
    const linkProcessPromises = Array.from(
      { length: linksFound },
      async (_, i) => {
        const link = links?.nth(i);
        if (!link) {
          return { ids: [] };
        }
        const [href, onclick, innerHTML] = await Promise.all([
          link.getAttribute('href').then((h) => h || ''),
          link.getAttribute('onclick').then((o) => o || ''),
          link.innerHTML().then((h) => h || ''),
        ]);

        const extractedIds = extractProductIdFromLink(href, onclick, innerHTML);
        return { ids: extractedIds };
      }
    );

    const linkResults = await Promise.all(linkProcessPromises);
    for (const result of linkResults) {
      ids.push(...result.ids);
    }
  }

  return {
    ids,
    usedSelector,
    linksFound,
  };
}

// ================================================
// PAGE HANDLERS
// ================================================

async function handleMainMenuPage(
  page: Page,
  crawlerInstance: PlaywrightCrawler
) {
  logger.info('Processing drink list page');

  await waitForLoad(page);
  await takeDebugScreenshot(page, 'starbucks-main-menu');

  const productIds = await extractProductIds(page);

  logger.info(
    `Selector used: ${productIds.usedSelector}, Links found: ${productIds.linksFound}`
  );
  logger.info(`Found ${productIds.ids.length} products to crawl`);

  // Limit products in test mode
  const productsToProcess = isTestMode
    ? productIds.ids.slice(0, maxProductsInTestMode)
    : productIds.ids;

  if (isTestMode) {
    logger.info(
      `🧪 Test mode: limiting to ${productsToProcess.length} products`
    );
  }

  // Prepare all product URLs
  const productRequests = productsToProcess.map((productId) => ({
    url: `${SITE_CONFIG.productUrlTemplate}${productId}`,
    userData: { productId, isProductPage: true },
  }));

  await crawlerInstance.addRequests(productRequests);
  logger.info(
    `Enqueued ${productsToProcess.length} product pages for processing`
  );
}

async function handleProductPage(
  page: Page,
  request: Request,
  crawlerInstance: PlaywrightCrawler
) {
  const productId = request.userData.productId;
  logger.info(`Processing product page: ${productId}`);

  try {
    await waitForLoad(page);
    // Wait for the main product element to ensure content is loaded
    await page.waitForSelector(SELECTORS.productDetails.name, {
      timeout: 10_000,
    });

    const product = await extractProductData(page);
    if (product.name && product.externalId) {
      const finalProduct: Product = {
        ...product,
        price: null,
        category: 'Drinks',
      };

      await crawlerInstance.pushData(finalProduct);

      logger.info(
        `✅ Extracted: ${finalProduct.name} (${finalProduct.nameEn}) - ID: ${finalProduct.externalId}`
      );
    } else {
      logger.warn(
        `⚠️ Failed to extract complete product data for ID: ${productId}`
      );
    }
  } catch (error) {
    logger.error(`❌ Error processing product ${productId}: ${error}`);
  }
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const createStarbucksCrawler = () =>
  new PlaywrightCrawler({
    launchContext: {
      launchOptions: CRAWLER_CONFIG.launchOptions,
    },
    async requestHandler({ page, request, crawler: crawlerInstance }) {
      const url = request.url;

      if (url.includes('drink_list.do')) {
        await handleMainMenuPage(page, crawlerInstance);
      } else if (request.userData?.isProductPage) {
        await handleProductPage(page, request, crawlerInstance);
      }
    },
    maxConcurrency: CRAWLER_CONFIG.maxConcurrency,
    maxRequestsPerCrawl: CRAWLER_CONFIG.maxRequestsPerCrawl,
    maxRequestRetries: CRAWLER_CONFIG.maxRequestRetries,
    requestHandlerTimeoutSecs: CRAWLER_CONFIG.requestHandlerTimeoutSecs,
  });

export const runStarbucksCrawler = async () => {
  const crawler = createStarbucksCrawler();

  try {
    await crawler.run([SITE_CONFIG.startUrl]);
    const dataset = await crawler.getData();
    await writeProductsToJson(dataset.items as Product[], 'starbucks');
  } catch (error) {
    logger.error('Starbucks crawler failed:', error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runStarbucksCrawler().catch((error) => {
    logger.error('Crawler execution failed:', error);
    process.exit(1);
  });
}
