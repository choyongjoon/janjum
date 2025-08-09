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
  baseUrl: 'https://mo.twosome.co.kr',
  startUrl: 'https://mo.twosome.co.kr/mn/menuInfoList.do',
  productUrlTemplate: 'https://mo.twosome.co.kr/mn/menuInfoDetail.do?menuCd=',
} as const;

// ================================================
// CSS SELECTORS & REGEX PATTERNS
// ================================================

// Regex patterns for performance optimization
const MENU_CODE_REGEX = /menuCd=([^&]+)/;

const SELECTORS = {
  // Category navigation selectors
  coffeeBeverage: '커피/음료', // getByText exact
  categoryList: '#midUl',
  categoryItems: '#midUl > li',

  // Product listing selectors
  productListItems: 'ul.ui-goods-list-default > li',
  productImg: '.thum-img > img',
  productName: '.menu-title',
  productLink: 'a', // get 'data' attribute for menu code

  // Product detail page selectors
  productDescription: 'dl.menu-detail-info-title > dd',
  productDetailName: '.menu-detail-info-title h1',
  productDetailImg: '.menu-detail-img img',
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
  : 50;

const CRAWLER_CONFIG = {
  maxConcurrency: process.env.CI ? 1 : 3, // Lower concurrency in CI
  maxRequestsPerCrawl: isTestMode ? maxRequestsInTestMode : 50,
  maxRequestRetries: process.env.CI ? 5 : 3, // More retries in CI
  requestHandlerTimeoutSecs: isTestMode ? 120 : process.env.CI ? 180 : 300, // Shorter timeout in CI
  navigationTimeoutSecs: process.env.CI ? 60 : 90, // Shorter navigation timeout in CI
  launchOptions: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection',
      '--disable-extensions',
      '--disable-default-apps',
      '--disable-background-networking',
      '--disable-sync',
      '--metrics-recording-only',
      '--no-default-browser-check',
      '--disable-web-security',
    ],
  },
};

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

async function extractCategoriesFromMenu(
  page: Page
): Promise<Array<{ name: string; element: Locator }>> {
  try {
    logger.info('📄 Extracting categories from menu');

    await waitForLoad(page);

    // Click on "커피/음료" to expand the category
    await page.getByText(SELECTORS.coffeeBeverage, { exact: true }).click();
    await waitForLoad(page);

    // Get category items
    const categoryElements = await page.locator(SELECTORS.categoryItems).all();
    const categories: Array<{ name: string; element: Locator }> = [];

    for (const element of categoryElements) {
      const text = await element.textContent();
      if (
        text?.trim() &&
        text.trim() !== SELECTORS.coffeeBeverage &&
        text.trim() !== 'NEW'
      ) {
        categories.push({
          name: text.trim(),
          element,
        });
        logger.info(`📋 Found category: ${text.trim()}`);
      } else if (text?.trim() === 'NEW') {
        logger.info('📋 Skipping NEW category');
      }
    }

    return categories;
  } catch (error) {
    logger.error(`❌ Failed to extract categories: ${error}`);
    return [];
  }
}

async function extractProductsFromListing(
  page: Page,
  categoryName: string
): Promise<Array<{ name: string; menuCode: string; imageUrl: string }>> {
  const products: Array<{ name: string; menuCode: string; imageUrl: string }> =
    [];

  try {
    logger.info(`📄 Extracting products from category: ${categoryName}`);

    await waitForLoad(page);

    // Find product containers
    const containers = await page.locator(SELECTORS.productListItems).all();

    if (containers.length === 0) {
      logger.warn(
        `⚠️ No product containers found for category: ${categoryName}`
      );
      return [];
    }

    logger.info(
      `🔍 Found ${containers.length} product containers in ${categoryName}`
    );

    // Limit products in test mode
    const containersToProcess = isTestMode
      ? containers.slice(0, maxProductsInTestMode)
      : containers;

    if (isTestMode) {
      logger.info(
        `🧪 Test mode: limiting to ${containersToProcess.length} products`
      );
    }

    // Process products in batches to avoid blocking
    const batchSize = 5;
    for (
      let batchStart = 0;
      batchStart < containersToProcess.length;
      batchStart += batchSize
    ) {
      const batch = containersToProcess.slice(
        batchStart,
        batchStart + batchSize
      );

      const batchResults = await Promise.all(
        batch.map(async (container, index) => {
          try {
            const [name, menuCode, imageUrl] = await Promise.all([
              container
                .locator(SELECTORS.productName)
                .textContent()
                .then((text) => text?.trim() || ''),
              container
                .locator(SELECTORS.productLink)
                .getAttribute('data')
                .then((data) => {
                  if (!data) {
                    return '';
                  }
                  // Extract menu code from URL like "/mn/menuInfoDetail.do?menuCd=10192141"
                  const match = data.match(MENU_CODE_REGEX);
                  return match ? match[1] : '';
                }),
              container
                .locator(SELECTORS.productImg)
                .getAttribute('src')
                .then((src) => {
                  if (!src) {
                    return '';
                  }
                  if (src.startsWith('http')) {
                    return src;
                  }
                  if (src.startsWith('/')) {
                    return `${SITE_CONFIG.baseUrl}${src}`;
                  }
                  return `${SITE_CONFIG.baseUrl}/${src}`;
                })
                .catch(() => ''),
            ]);

            if (name && menuCode) {
              logger.info(`✅ Extracted: ${name} (menuCode: ${menuCode})`);
              return { name, menuCode, imageUrl };
            }
            return null;
          } catch (productError) {
            logger.debug(
              `⚠️ Failed to extract product ${batchStart + index + 1}: ${productError}`
            );
            return null;
          }
        })
      );

      // Add successful extractions to products array
      for (const result of batchResults) {
        if (result) {
          products.push(result);
        }
      }
    }

    logger.info(
      `📦 Successfully extracted ${products.length} products from ${categoryName}`
    );
    return products;
  } catch (extractionError) {
    logger.error(
      `❌ Failed to extract products from ${categoryName}: ${extractionError}`
    );
    return [];
  }
}

function createBasicProduct(
  productInfo: { name: string; menuCode: string; imageUrl: string },
  categoryName: string
): Product {
  const externalId = `twosome_${productInfo.menuCode}`;

  return {
    name: productInfo.name,
    nameEn: null,
    description: null,
    price: null,
    externalImageUrl: productInfo.imageUrl,
    category: null, // Category will be set later
    externalCategory: categoryName,
    externalId,
    externalUrl: `${SITE_CONFIG.productUrlTemplate}${productInfo.menuCode}`,
  };
}

// ================================================
// PAGE HANDLERS
// ================================================

async function handleMainMenuPage(
  page: Page,
  crawlerInstance: PlaywrightCrawler
) {
  logger.info('Processing main menu page to discover categories');

  // Set CI-appropriate timeouts
  const navigationTimeout = process.env.CI ? 60_000 : 90_000; // 60s in CI, 90s locally
  const defaultTimeout = process.env.CI ? 30_000 : 60_000; // 30s in CI, 60s locally

  page.setDefaultNavigationTimeout(navigationTimeout);
  page.setDefaultTimeout(defaultTimeout);

  logger.info(
    `Navigation timeout: ${navigationTimeout}ms, Default timeout: ${defaultTimeout}ms`
  );
  logger.info(`Current URL: ${page.url()}`);

  await waitForLoad(page);

  // Only take screenshots in debug mode to save time in CI
  if (process.env.NODE_ENV !== 'production') {
    await takeDebugScreenshot(page, 'twosome-main-menu');
  }

  const categories = await extractCategoriesFromMenu(page);

  if (categories.length === 0) {
    logger.error('❌ No categories found');
    return;
  }

  // Limit categories in test mode
  const categoriesToProcess = isTestMode ? categories.slice(0, 1) : categories;

  if (isTestMode) {
    logger.info(
      `🧪 Test mode: limiting to ${categoriesToProcess.length} categories`
    );
  }

  // Process each category
  for (const category of categoriesToProcess) {
    try {
      await category.element.click();
      await waitForLoad(page);

      const products = await extractProductsFromListing(page, category.name);

      // Create products directly from listing page info (avoid timeout issues)
      const createdProducts = products.map((product) =>
        createBasicProduct(product, category.name)
      );

      // Push products to crawler dataset in smaller batches to avoid blocking
      const batchSize = 10;
      for (let i = 0; i < createdProducts.length; i += batchSize) {
        const batch = createdProducts.slice(i, i + batchSize);
        await Promise.all(
          batch.map((product) => crawlerInstance.pushData(product))
        );
      }

      logger.info(
        `📊 Added ${createdProducts.length} products from ${category.name}`
      );
    } catch (categoryError) {
      logger.error(
        `❌ Failed to process category ${category.name}: ${categoryError}`
      );
    }
  }
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const createTwosomeCrawler = () =>
  new PlaywrightCrawler({
    launchContext: {
      launchOptions: CRAWLER_CONFIG.launchOptions,
    },
    async requestHandler({ page, crawler: crawlerInstance, request }) {
      try {
        logger.info(`🌐 Attempting to crawl: ${request.url}`);
        logger.info(
          `Browser: ${page.context().browser()?.browserType().name()}`
        );
        logger.info(
          `Environment: CI=${process.env.CI}, NODE_ENV=${process.env.NODE_ENV}`
        );

        // Set user agent to match a real browser
        await page.setExtraHTTPHeaders({
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.8,en-US;q=0.5,en;q=0.3',
          'Accept-Encoding': 'gzip, deflate',
          DNT: '1',
          Connection: 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        });

        await handleMainMenuPage(page, crawlerInstance);
      } catch (error) {
        logger.error(`❌ Failed to process ${request.url}: ${error}`);
        logger.error(
          `Error stack: ${error instanceof Error ? error.stack : 'No stack trace'}`
        );

        // Add page content for debugging in CI
        if (process.env.CI) {
          try {
            const pageContent = await page.content();
            logger.error(`Page content length: ${pageContent.length}`);
            logger.error(
              `Page title: ${await page.title().catch(() => 'No title')}`
            );
          } catch (debugError) {
            logger.error(`Failed to get debug info: ${String(debugError)}`);
          }
        }

        throw error;
      }
    },
    failedRequestHandler({ request, error }) {
      logger.error(
        `❌ Request failed completely: ${request.url} - ${error instanceof Error ? error.message : String(error)}`
      );
    },
    maxConcurrency: CRAWLER_CONFIG.maxConcurrency,
    maxRequestsPerCrawl: CRAWLER_CONFIG.maxRequestsPerCrawl,
    maxRequestRetries: CRAWLER_CONFIG.maxRequestRetries,
    requestHandlerTimeoutSecs: CRAWLER_CONFIG.requestHandlerTimeoutSecs,
    navigationTimeoutSecs: CRAWLER_CONFIG.navigationTimeoutSecs,
  });

async function checkSiteAccessibility(url: string): Promise<boolean> {
  try {
    logger.info(`🔍 Checking site accessibility: ${url}`);
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
      signal: AbortSignal.timeout(10_000), // 10 second timeout
    });

    logger.info(
      `Site accessibility check: ${response.status} ${response.statusText}`
    );
    const isAccessible = response.ok || response.status === 403; // 403 might still allow crawler access

    if (!isAccessible) {
      logger.warn(
        `Site returned non-ok status: ${response.status} ${response.statusText}`
      );
    }

    return isAccessible;
  } catch (error) {
    logger.error(`Site accessibility check failed: ${error}`);
    logger.error(
      'This may indicate network issues or geo-restrictions in CI environment'
    );
    return false;
  }
}

export const runTwosomeCrawler = async () => {
  const crawler = createTwosomeCrawler();

  try {
    // Check if the URL is accessible
    const isAccessible = await checkSiteAccessibility(SITE_CONFIG.startUrl);

    if (isAccessible) {
      logger.info('✅ Site accessibility check passed');
    } else if (process.env.CI) {
      // In CI, try to proceed anyway as some sites block HEAD requests but allow browser access
      logger.warn(
        '⚠️ Site accessibility check failed in CI, but attempting to proceed with browser crawl'
      );
    } else {
      throw new Error('Primary URL is not accessible');
    }

    logger.info(`🌐 Starting crawler with URL: ${SITE_CONFIG.startUrl}`);
    logger.info(
      `🔧 Crawler config: maxConcurrency=${CRAWLER_CONFIG.maxConcurrency}, requestHandlerTimeout=${CRAWLER_CONFIG.requestHandlerTimeoutSecs}s`
    );

    await crawler.run([SITE_CONFIG.startUrl]);
    const dataset = await crawler.getData();

    if (!dataset.items || dataset.items.length === 0) {
      throw new Error('No data was extracted from the crawler');
    }

    logger.info(`📊 Extracted ${dataset.items.length} items from crawler`);
    await writeProductsToJson(dataset.items as Product[], 'twosome');
  } catch (error) {
    logger.error(`Twosome crawler failed: ${String(error)}`);

    // Additional debugging information for CI
    if (process.env.CI) {
      logger.error('🔍 CI Environment debug info:');
      logger.error(`- NODE_ENV: ${process.env.NODE_ENV}`);
      logger.error(`- CI: ${process.env.CI}`);
      logger.error(`- RUNNER_OS: ${process.env.RUNNER_OS}`);
      logger.error(
        `- Available memory: ${process.memoryUsage().heapTotal / 1024 / 1024}MB`
      );
    }

    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runTwosomeCrawler().catch((error) => {
    logger.error('Crawler execution failed:', error);
    process.exit(1);
  });
}
