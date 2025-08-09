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
  baseUrl: 'https://paikdabang.com',
  startUrl: 'https://paikdabang.com/menu/menu_new/',
} as const;

// ================================================
// CSS SELECTORS
// ================================================

const SELECTORS = {
  // Category discovery selectors
  categoryTabs: 'ul.page_tab a',

  // Product listing selectors
  menuItems: '.menu_list > ul > li',

  // Product data selectors
  productData: {
    name: 'p.menu_tit',
    description: 'p.txt',
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
  : 30;

const CRAWLER_CONFIG = {
  maxConcurrency: 2,
  maxRequestsPerCrawl: isTestMode ? maxRequestsInTestMode : 30,
  maxRequestRetries: 2,
  requestHandlerTimeoutSecs: isTestMode ? 30 : 45,
  launchOptions: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] as string[],
  },
  maxItemsPerCategory: isTestMode ? maxProductsInTestMode : 20,
};

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

// Extract category URLs from the main menu page
async function extractCategoryUrls(
  page: Page
): Promise<Array<{ url: string; name: string }>> {
  try {
    logger.info('📄 Extracting category URLs from tabs');

    await waitForLoad(page);

    // Get all category tab links
    await page.waitForSelector(SELECTORS.categoryTabs, { timeout: 10_000 });
    const categoryTabs = await page.locator(SELECTORS.categoryTabs).all();

    logger.info(`🏷️  Found ${categoryTabs.length} category tabs`);

    const categories: Array<{ url: string; name: string }> = [];

    for (const tab of categoryTabs) {
      const [href, text] = await Promise.all([
        tab.getAttribute('href'),
        tab.textContent(),
      ]);

      if (href && text) {
        const categoryName = text.trim();

        // Skip 신메뉴 (New Menu) to avoid duplicates as requested
        if (categoryName === '신메뉴') {
          logger.info(`⏭️  Skipping category: ${categoryName} (duplicates)`);
          continue;
        }

        const fullUrl = href.startsWith('http')
          ? href
          : `${SITE_CONFIG.baseUrl}${href}`;
        categories.push({ url: fullUrl, name: categoryName });
        logger.info(`📋 Found category: ${categoryName} -> ${fullUrl}`);
      }
    }

    return categories;
  } catch (error) {
    logger.error(`❌ Failed to extract category URLs: ${error}`);
    return [];
  }
}

// Find menu items using configured selector
async function findMenuItems(
  page: Page
): Promise<{ items: Locator[]; selector: string }> {
  const selector = SELECTORS.menuItems;

  try {
    await page.waitForSelector(selector, { timeout: 10_000 });
    const items = await page.locator(selector).all();
    logger.info(`✅ Found ${items.length} items using selector: ${selector}`);
    return { items, selector };
  } catch {
    logger.warn(`⚠️  Selector ${selector} not found`);
    return { items: [], selector: '' };
  }
}

// Extract product name using configured selector
async function extractProductName(menuItem: Locator): Promise<string> {
  try {
    const name = await menuItem
      .locator(SELECTORS.productData.name)
      .textContent({ timeout: 1000 })
      .then((text: string | null) => text?.trim() || '')
      .catch(() => '');
    return name;
  } catch {
    return '';
  }
}

// Extract product image URL
function extractProductImage(menuItem: Locator): Promise<string> {
  return menuItem
    .locator(SELECTORS.productData.image)
    .first()
    .getAttribute('src')
    .then((src: string | null) => {
      if (!src) {
        return '';
      }
      return src.startsWith('http') ? src : `${SITE_CONFIG.baseUrl}${src}`;
    })
    .catch(() => '');
}

// Extract product description with hover fallback
async function extractProductDescription(
  menuItem: Locator,
  page: Page
): Promise<string> {
  try {
    // Try to get description without hover first
    let description = await menuItem
      .locator(SELECTORS.productData.description)
      .textContent({ timeout: 500 })
      .then((text: string | null) => text?.trim() || '')
      .catch(() => '');

    // If no description found, try hover
    if (!description) {
      await menuItem.hover({ timeout: 500 });
      await page.waitForTimeout(200);
      description = await menuItem
        .locator(SELECTORS.productData.description)
        .textContent({ timeout: 500 })
        .then((text: string | null) => text?.trim() || '')
        .catch(() => '');
    }

    return description;
  } catch {
    return '';
  }
}

// Create product from extracted data
function createProduct(
  name: string,
  imageUrl: string,
  description: string,
  category: string,
  pageUrl: string
): Product {
  const externalId = `paik_${category}_${name}`;

  return {
    name,
    nameEn: null,
    description: description || null,
    price: null,
    externalImageUrl: imageUrl,
    category,
    externalCategory: category,
    externalId,
    externalUrl: pageUrl,
  };
}

// Check if product name is valid
function isValidProductName(name: string): boolean {
  return !!(
    name &&
    name.length > 2 &&
    !name.includes('undefined') &&
    !name.includes('null')
  );
}

// Extract products from a category page
async function extractProductsFromPage(
  page: Page,
  categoryName: string
): Promise<Product[]> {
  const products: Product[] = [];

  try {
    logger.info(`📄 Extracting products from category: ${categoryName}`);

    await waitForLoad(page);

    // Find menu items using multiple selectors
    const { items: menuItems, selector: usedSelector } =
      await findMenuItems(page);

    if (menuItems.length === 0) {
      logger.warn(
        `⚠️  No menu items found for category: ${categoryName} with any selector`
      );
      return [];
    }

    logger.info(
      `🔍 Found ${menuItems.length} menu items in ${categoryName} using ${usedSelector}`
    );

    // Process each menu item with reduced limits for performance
    const maxItemsToProcess = Math.min(
      menuItems.length,
      CRAWLER_CONFIG.maxItemsPerCategory
    );
    logger.info(
      `📝 Processing ${maxItemsToProcess} items out of ${menuItems.length} found`
    );

    for (let i = 0; i < maxItemsToProcess; i++) {
      try {
        const menuItem = menuItems[i];

        const [name, imageUrl, description] = await Promise.all([
          extractProductName(menuItem),
          extractProductImage(menuItem),
          extractProductDescription(menuItem, page),
        ]);

        if (isValidProductName(name)) {
          const product = createProduct(
            name,
            imageUrl,
            description,
            categoryName,
            page.url()
          );

          // Check for duplicates
          if (!products.some((p) => p.externalId === product.externalId)) {
            products.push(product);
            logger.info(`✅ Extracted: ${name} (${product.category})`);
          }
        }
      } catch (productError) {
        logger.debug(
          `⚠️  Failed to extract menu item ${i + 1}: ${productError}`
        );
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
  await takeDebugScreenshot(page, 'paik-main-menu');

  const categories = await extractCategoryUrls(page);

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

  // Enqueue all category pages
  const categoryRequests = categoriesToProcess.map((category) => ({
    url: category.url,
    userData: {
      categoryName: category.name,
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
  logger.info(`🔖 Processing category page: ${categoryName}`);

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

export const createPaikCrawler = () =>
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

export const runPaikCrawler = async () => {
  const crawler = createPaikCrawler();

  try {
    await crawler.run([SITE_CONFIG.startUrl]);
    const dataset = await crawler.getData();
    await writeProductsToJson(dataset.items as Product[], 'paik');
  } catch (error) {
    logger.error('Paik crawler failed:', error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runPaikCrawler().catch((error) => {
    logger.error('Crawler execution failed:', error);
    process.exit(1);
  });
}
