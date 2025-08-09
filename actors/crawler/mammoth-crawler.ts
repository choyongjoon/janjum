import { PlaywrightCrawler } from 'crawlee';
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
  baseUrl: 'https://mmthcoffee.com',
  startUrl: 'https://mmthcoffee.com/sub/menu/list_coffee.php', // Use the coffee-specific URL
  menuListUrls: [
    'https://mmthcoffee.com/sub/menu/list_coffee.php',
    'https://mmthcoffee.com/sub/menu/list_sub.php?menuType=F', // Food/Dessert
  ],
  productUrlTemplate:
    'https://mmthcoffee.com/sub/menu/list_coffee_view.php?menuSeq=',
} as const;

// ================================================
// CSS SELECTORS
// ================================================

const SELECTORS = {
  // Product item selectors - simplified based on research
  productItems: 'ul li a[href*="goViewB"]',

  // Product data extraction
  productData: {
    koreanName: 'strong',
    image: 'img',
    link: '', // The entire anchor element
  },

  // Product detail page selectors
  productDetails: {
    name: '.product-title, h1, .detail-name',
    description: '.product-description, .detail-desc',
    category: '.product-category, .detail-category',
    image: '.product-image img, .detail-image img',
    price: '.price, .product-price',
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
  : 150;

const CRAWLER_CONFIG = {
  maxConcurrency: 4,
  maxRequestsPerCrawl: isTestMode ? maxRequestsInTestMode : 150,
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

const menuSeqRegex = /goViewB\(['""]?(\d+)['""]?\)/;

function extractMenuSeqFromHref(href: string): string | null {
  const match = href.match(menuSeqRegex);
  return match ? match[1] : null;
}

// ================================================
// PAGE HANDLERS
// ================================================

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: optimize later
async function handleMenuListPage(
  page: Page,
  crawlerInstance: PlaywrightCrawler
) {
  logger.info('Processing Mammoth Coffee menu list page');

  await waitForLoad(page);
  await takeDebugScreenshot(page, 'mammoth-menu-list');

  // Extract products directly from the list page
  const products: Product[] = [];

  try {
    const productLinks = await page.locator(SELECTORS.productItems).all();
    logger.info(`Found ${productLinks.length} product links on the page`);

    for (const link of productLinks) {
      try {
        // Extract href and menuSeq
        const href = await link.getAttribute('href').catch(() => '');
        const menuSeq = extractMenuSeqFromHref(href || '');

        if (!menuSeq) {
          continue;
        }

        // Extract Korean name from strong tag
        const koreanName = await link
          .locator('strong')
          .textContent()
          .catch(() => '');

        // Extract full text and get English name by removing Korean name
        const fullText = await link.textContent().catch(() => '');
        const englishName = fullText?.replace(koreanName || '', '').trim();

        // Extract image
        const imageSrc = await link
          .locator('img')
          .getAttribute('src')
          .catch(() => '');

        if (koreanName) {
          const product: Product = {
            name: koreanName,
            nameEn: englishName || '',
            description: '',
            externalCategory: 'Coffee',
            externalId: menuSeq,
            externalImageUrl: imageSrc
              ? new URL(imageSrc, SITE_CONFIG.baseUrl).href
              : '',
            externalUrl: `${SITE_CONFIG.productUrlTemplate}${menuSeq}`,
            price: null,
            category: 'Coffee',
          };

          products.push(product);
          logger.info(
            `✅ Extracted: ${product.name}${product.nameEn ? ` (${product.nameEn})` : ''}`
          );
        }
      } catch (error) {
        logger.warn(`Error processing product link: ${error}`);
      }
    }
  } catch (error) {
    logger.error(`Error extracting products from list page: ${error}`);
  }

  // Limit products in test mode
  const productsToProcess = isTestMode
    ? products.slice(0, maxProductsInTestMode)
    : products;

  if (isTestMode) {
    logger.info(
      `🧪 Test mode: limiting to ${productsToProcess.length} products`
    );
  }

  // Push products directly to crawler
  for (const product of productsToProcess) {
    await crawlerInstance.pushData(product);
  }

  logger.info(
    `Processed ${productsToProcess.length} products from Mammoth Coffee menu`
  );
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const createMammothCrawler = () =>
  new PlaywrightCrawler({
    launchContext: {
      launchOptions: CRAWLER_CONFIG.launchOptions,
    },
    async requestHandler({ page, crawler: crawlerInstance }) {
      // Only handle menu list pages, extract products directly from them
      await handleMenuListPage(page, crawlerInstance);
    },
    maxConcurrency: CRAWLER_CONFIG.maxConcurrency,
    maxRequestsPerCrawl: CRAWLER_CONFIG.maxRequestsPerCrawl,
    maxRequestRetries: CRAWLER_CONFIG.maxRequestRetries,
    requestHandlerTimeoutSecs: CRAWLER_CONFIG.requestHandlerTimeoutSecs,
  });

export const runMammothCrawler = async () => {
  const crawler = createMammothCrawler();

  try {
    // Start with multiple menu pages to get comprehensive coverage
    const startUrls = [SITE_CONFIG.startUrl, ...SITE_CONFIG.menuListUrls];

    await crawler.run(startUrls);
    const dataset = await crawler.getData();
    await writeProductsToJson(dataset.items as Product[], 'mammoth');
  } catch (error) {
    logger.error('Mammoth Coffee crawler failed:', error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runMammothCrawler().catch((error) => {
    logger.error('Crawler execution failed:', error);
    process.exit(1);
  });
}
