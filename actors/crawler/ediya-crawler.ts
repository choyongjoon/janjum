import { PlaywrightCrawler, type Request } from 'crawlee';
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
  baseUrl: 'https://ediya.com',
  startUrl: 'https://ediya.com/contents/drink.html',
  categoryUrlTemplate: 'https://ediya.com/contents/drink.html?chked_val=',
} as const;

// ================================================
// CSS SELECTORS & REGEX PATTERNS
// ================================================

// Regex patterns for performance optimization
const GIFT_SUFFIX_REGEX = /\s*선물하기\s*$/;

const SELECTORS = {
  // Category discovery selectors
  categoryCheckboxes: 'input[name="chkList"]',

  // Product listing selectors
  productContainers: '#menu_ul > li',

  // Product data selectors
  productData: {
    name: '.menu_tt > a > span',
    nameEn: 'div.detail_con > h2 > span',
    description: '.detail_txt',
    image: '> a > img',
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
  : 50;

const CRAWLER_CONFIG = {
  maxConcurrency: 2,
  maxRequestsPerCrawl: isTestMode ? maxRequestsInTestMode : 50,
  maxRequestRetries: 2,
  requestHandlerTimeoutSecs: isTestMode ? 30 : 60,
  launchOptions: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] as string[],
  },
};

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

async function extractCategoryValues(
  page: Page
): Promise<Array<{ value: string; name: string }>> {
  try {
    logger.info('📄 Extracting category checkboxes');

    await waitForLoad(page);

    // Get all category checkboxes
    await page.waitForSelector(SELECTORS.categoryCheckboxes, {
      timeout: 10_000,
    });
    const checkboxes = await page.locator(SELECTORS.categoryCheckboxes).all();

    logger.info(`🏷️ Found ${checkboxes.length} category checkboxes`);

    const categories: Array<{ value: string; name: string }> = [];

    for (const checkbox of checkboxes) {
      const [value, label] = await Promise.all([
        checkbox.getAttribute('value'),
        checkbox.evaluate((el) => {
          // Try to find associated label text
          const parent = el.closest('label') || el.parentElement;
          return parent?.textContent?.trim() || '';
        }),
      ]);

      if (value && label) {
        categories.push({ value, name: label });
        logger.info(`📋 Found category: ${label} -> value: ${value}`);
      }
    }

    return categories;
  } catch (error) {
    logger.error(`❌ Failed to extract category values: ${error}`);
    return [];
  }
}

async function extractProductData(container: Locator): Promise<{
  name: string;
  nameEn: string | null;
  description: string | null;
  imageUrl: string;
} | null> {
  try {
    const [name, nameEn, description, imageUrl] = await Promise.all([
      container
        .locator(SELECTORS.productData.name)
        .textContent()
        .then((text) => {
          if (!text) {
            return '';
          }
          // Clean the name by removing whitespace and gift suffix
          const cleaned = text.trim().replace(GIFT_SUFFIX_REGEX, '');
          return cleaned;
        }),
      container
        .locator(SELECTORS.productData.nameEn)
        .textContent()
        .then((text) => text?.trim() || null)
        .catch(() => null),
      container
        .locator(SELECTORS.productData.description)
        .textContent()
        .then((text) => text?.trim() || null)
        .catch(() => null),
      container
        .locator(SELECTORS.productData.image)
        .getAttribute('src')
        .then((src) => {
          if (!src) {
            return '';
          }

          // Handle relative paths properly
          if (src.startsWith('/')) {
            return `${SITE_CONFIG.baseUrl}${src}`;
          }
          if (src.startsWith('http')) {
            return src;
          }
          // Relative path without leading slash
          return `${SITE_CONFIG.baseUrl}/${src}`;
        })
        .catch(() => ''),
    ]);

    if (name && name.length > 0) {
      return {
        name,
        nameEn,
        description,
        imageUrl,
      };
    }
  } catch (error) {
    logger.debug(`⚠️ Failed to extract product data: ${error}`);
  }
  return null;
}

function createProduct(
  productData: {
    name: string;
    nameEn: string | null;
    description: string | null;
    imageUrl: string;
  },
  categoryName: string,
  pageUrl: string
): Product {
  const externalId = `ediya_${categoryName}_${productData.name}`;

  return {
    name: productData.name,
    nameEn: productData.nameEn,
    description: productData.description,
    price: null,
    externalImageUrl: productData.imageUrl,
    category: 'Drinks',
    externalCategory: categoryName,
    externalId,
    externalUrl: pageUrl,
  };
}

async function extractProductsFromPage(
  page: Page,
  categoryName: string
): Promise<Product[]> {
  const products: Product[] = [];

  try {
    logger.info(`📄 Extracting products from category: ${categoryName}`);

    await waitForLoad(page);

    // Find product containers
    const containers = await page.locator(SELECTORS.productContainers).all();

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

    // Process each product container
    for (let i = 0; i < containersToProcess.length; i++) {
      try {
        const container = containersToProcess[i];

        const productData = await extractProductData(container);

        if (productData) {
          const product = createProduct(productData, categoryName, page.url());

          // Check for duplicates
          if (!products.some((p) => p.externalId === product.externalId)) {
            products.push(product);
            logger.info(
              `✅ Extracted: ${product.name} (${product.externalCategory})`
            );
          }
        }
      } catch (productError) {
        logger.debug(`⚠️ Failed to extract product ${i + 1}: ${productError}`);
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

// ================================================
// PAGE HANDLERS
// ================================================

async function handleMainMenuPage(
  page: Page,
  crawlerInstance: PlaywrightCrawler
) {
  logger.info('Processing main menu page to discover categories');

  await waitForLoad(page);
  await takeDebugScreenshot(page, 'ediya-main-menu');

  const categories = await extractCategoryValues(page);

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

  // Enqueue category pages
  const categoryRequests = categoriesToProcess.map((category) => ({
    url: `${SITE_CONFIG.categoryUrlTemplate}${category.value},&skeyword=#blockcate`,
    userData: {
      categoryName: category.name,
      categoryValue: category.value,
      isCategoryPage: true,
    },
  }));

  await crawlerInstance.addRequests(categoryRequests);
  logger.info(
    `📋 Enqueued ${categoriesToProcess.length} category pages for processing`
  );
}

async function handleCategoryPage(
  page: Page,
  request: Request,
  crawlerInstance: PlaywrightCrawler
) {
  const categoryName = request.userData.categoryName;
  const categoryValue = request.userData.categoryValue;

  logger.info(
    `🔖 Processing category page: ${categoryName} (value: ${categoryValue})`
  );

  const products = await extractProductsFromPage(page, categoryName);

  // Push all products to crawler dataset
  await Promise.all(
    products.map((product) => crawlerInstance.pushData(product))
  );

  logger.info(`📊 Added ${products.length} products from ${categoryName}`);
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const createEdiyaCrawler = () =>
  new PlaywrightCrawler({
    launchContext: {
      launchOptions: CRAWLER_CONFIG.launchOptions,
    },
    async requestHandler({ page, request, crawler: crawlerInstance }) {
      if (request.userData?.isCategoryPage) {
        await handleCategoryPage(page, request, crawlerInstance);
      } else {
        await handleMainMenuPage(page, crawlerInstance);
      }
    },
    maxConcurrency: CRAWLER_CONFIG.maxConcurrency,
    maxRequestsPerCrawl: CRAWLER_CONFIG.maxRequestsPerCrawl,
    maxRequestRetries: CRAWLER_CONFIG.maxRequestRetries,
    requestHandlerTimeoutSecs: CRAWLER_CONFIG.requestHandlerTimeoutSecs,
  });

export const runEdiyaCrawler = async () => {
  const crawler = createEdiyaCrawler();

  try {
    await crawler.run([SITE_CONFIG.startUrl]);
    const dataset = await crawler.getData();
    await writeProductsToJson(dataset.items as Product[], 'ediya');
  } catch (error) {
    logger.error('Ediya crawler failed:', error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runEdiyaCrawler().catch((error) => {
    logger.error('Crawler execution failed:', error);
    process.exit(1);
  });
}
