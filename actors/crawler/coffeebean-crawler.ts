import { PlaywrightCrawler } from 'crawlee';
import type { Locator, Page } from 'playwright';
import { logger } from '../../shared/logger';
import type { Nutritions } from '../../shared/nutritions';
import { type Product, waitForLoad, writeProductsToJson } from './crawlerUtils';

// ================================================
// SITE STRUCTURE CONFIGURATION
// ================================================

const SITE_CONFIG = {
  baseUrl: 'https://www.coffeebeankorea.com',
  startUrl: 'https://www.coffeebeankorea.com/menu/list.asp?category=13',
  categoryUrlTemplate:
    'https://www.coffeebeankorea.com/menu/list.asp?category=13',
} as const;

// ================================================
// CSS SELECTORS
// ================================================

const SELECTORS = {
  // Category navigation selectors
  categoryLinks: 'ul.lnb_wrap2 > li:nth-child(1) > ul:nth-child(2) li a',

  pagination: 'div.paging > a',

  // Product listing selectors
  productContainers: '.menu_list > li',

  // Product data selectors
  productName: 'dl.txt > dt > span:nth-child(2)',
  nameEn: 'dl.txt > dt > span:nth-child(1)',
  productImage: 'img',
  productDescription: 'dl.txt > dd',
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
  requestHandlerTimeoutSecs: isTestMode ? 60 : 240,
  launchOptions: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] as string[],
  },
} as const;

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: refactor later
async function extractNutritionData(
  container: Locator
): Promise<Nutritions | null> {
  try {
    // Look for nutrition data in the .info selector
    const nutritionElement = container.locator('.info');

    // Check if nutrition element exists
    const nutritionElementCount = await nutritionElement.count();
    if (nutritionElementCount === 0) {
      return null;
    }

    // Extract nutrition data from dl elements
    const dlElements = nutritionElement.locator('dl');
    const dlCount = await dlElements.count();

    if (dlCount === 0) {
      return null;
    }

    const nutritions: Partial<Nutritions> = {};

    for (let i = 0; i < dlCount; i++) {
      const dl = dlElements.nth(i);
      const dt = await dl.locator('dt').textContent();
      const dd = await dl.locator('dd').textContent();

      if (!(dt && dd)) {
        continue;
      }

      const value = Number.parseInt(dt.trim(), 10);
      if (Number.isNaN(value)) {
        continue;
      }

      const label = dd.replace(/\s+/g, ' ').trim().toLowerCase();

      if (label.includes('열량') || label.includes('kcal')) {
        nutritions.calories = value;
        nutritions.caloriesUnit = 'kcal';
      } else if (label.includes('나트륨') || label.includes('sodium')) {
        nutritions.natrium = value;
        nutritions.natriumUnit = 'mg';
      } else if (label.includes('탄수화물') || label.includes('carbohydrate')) {
        nutritions.carbohydrates = value;
        nutritions.carbohydratesUnit = 'g';
      } else if (label.includes('당') || label.includes('sugar')) {
        nutritions.sugar = value;
        nutritions.sugarUnit = 'g';
      } else if (label.includes('단백질') || label.includes('protein')) {
        nutritions.protein = value;
        nutritions.proteinUnit = 'g';
      } else if (label.includes('카페인') || label.includes('caffeine')) {
        nutritions.caffeine = value;
        nutritions.caffeineUnit = 'mg';
      } else if (label.includes('포화지방') || label.includes('saturated')) {
        nutritions.saturatedFat = value;
        nutritions.saturatedFatUnit = 'g';
      }
    }

    // Return nutritions object only if we found at least one value
    return Object.keys(nutritions).length > 0
      ? (nutritions as Nutritions)
      : null;
  } catch (error) {
    logger.debug(
      'Failed to extract nutrition data from Coffeebean menu item:',
      error as Record<string, unknown>
    );
    return null;
  }
}

async function extractCategoriesFromMenu(
  page: Page
): Promise<Array<{ name: string; url: string }>> {
  try {
    logger.info('📄 Extracting categories from menu');

    await waitForLoad(page);

    // Get category links
    const categoryElements = await page.locator(SELECTORS.categoryLinks).all();
    const categories: Array<{ name: string; url: string }> = [];

    for (const element of categoryElements) {
      const [text, href] = await Promise.all([
        element.textContent(),
        element.getAttribute('href'),
      ]);

      if (text?.trim() && href) {
        const categoryName = text.trim();
        const fullUrl = href.startsWith('http')
          ? href
          : `${SITE_CONFIG.baseUrl}${href}`;

        // Include all categories found by the selector
        categories.push({
          name: categoryName,
          url: fullUrl,
        });
        logger.info(`📋 Found category: ${categoryName}`);
      }
    }

    return categories;
  } catch (error) {
    logger.error(`❌ Failed to extract categories: ${error}`);
    return [];
  }
}

async function findNextPageLink(
  paginationLinks: Locator[],
  currentPage: number
): Promise<Locator | null> {
  for (const link of paginationLinks) {
    const linkText = await link.textContent();
    const href = await link.getAttribute('href');

    if (
      href &&
      (linkText?.includes('다음') ||
        linkText?.includes('next') ||
        linkText?.trim() === String(currentPage + 1))
    ) {
      return link;
    }
  }
  return null;
}

function shouldContinuePagination(
  pageProducts: {
    name: string;
    nameEn: string | null;
    imageUrl: string;
    description: string | null;
  }[]
): boolean {
  if (isTestMode) {
    logger.info('🧪 Test mode: limiting to first page only');
    return false;
  }

  if (pageProducts.length === 0) {
    return false;
  }

  return true;
}

async function navigateToNextPage(
  page: Page,
  currentPage: number
): Promise<boolean> {
  const paginationLinks = await page.locator(SELECTORS.pagination).all();
  const nextPageLink = await findNextPageLink(paginationLinks, currentPage);

  if (nextPageLink) {
    const linkText = await nextPageLink.textContent();
    logger.info(`🔗 Found next page link: ${linkText?.trim()}`);

    await nextPageLink.click();
    await waitForLoad(page);
    return true;
  }

  logger.info(`📄 No more pages found after page ${currentPage}`);
  return false;
}

async function extractProductsFromListing(
  page: Page,
  categoryName: string
): Promise<
  Array<{
    name: string;
    nameEn: string | null;
    imageUrl: string;
    description: string | null;
    nutritions: Nutritions | null;
  }>
> {
  const allProducts: Array<{
    name: string;
    nameEn: string | null;
    imageUrl: string;
    description: string | null;
    nutritions: Nutritions | null;
  }> = [];

  try {
    logger.info(`📄 Extracting products from category: ${categoryName}`);

    let currentPage = 1;
    let hasMorePages = true;

    while (hasMorePages) {
      logger.info(`📄 Processing page ${currentPage} for ${categoryName}`);

      await waitForLoad(page);

      const pageProducts = await extractProductsFromCurrentPage(
        page,
        categoryName,
        currentPage
      );
      allProducts.push(...pageProducts);

      const shouldContinue = shouldContinuePagination(pageProducts);
      if (shouldContinue) {
        const navigatedToNext = await navigateToNextPage(page, currentPage);
        if (navigatedToNext) {
          currentPage++;
        } else {
          hasMorePages = false;
        }
      } else {
        hasMorePages = false;
      }
    }

    logger.info(
      `📦 Successfully extracted ${allProducts.length} products from ${categoryName} across ${currentPage} pages`
    );
    return allProducts;
  } catch (extractionError) {
    logger.error(
      `❌ Failed to extract products from ${categoryName}: ${extractionError}`
    );
    return [];
  }
}

async function extractProductsFromCurrentPage(
  page: Page,
  categoryName: string,
  pageNumber: number
): Promise<
  Array<{
    name: string;
    nameEn: string | null;
    imageUrl: string;
    description: string | null;
    nutritions: Nutritions | null;
  }>
> {
  const products: Array<{
    name: string;
    nameEn: string | null;
    imageUrl: string;
    description: string | null;
    nutritions: Nutritions | null;
  }> = [];

  try {
    // Find product containers
    const containers = await page.locator(SELECTORS.productContainers).all();

    if (containers.length === 0) {
      logger.warn(
        `⚠️ No product containers found on page ${pageNumber} for category: ${categoryName}`
      );
      return [];
    }

    logger.info(
      `🔍 Found ${containers.length} product containers on page ${pageNumber} in ${categoryName}`
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
            const [name, nameEn, imageUrl, description, nutritions] =
              await Promise.all([
                container
                  .locator(SELECTORS.productName)
                  .textContent()
                  .then((text) => text?.trim() || ''),
                container
                  .locator(SELECTORS.nameEn)
                  .textContent()
                  .then((text) => text?.trim() || null)
                  .catch(() => null),
                container
                  .locator(SELECTORS.productImage)
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
                container
                  .locator(SELECTORS.productDescription)
                  .textContent()
                  .then((text) => text?.trim() || null)
                  .catch(() => null),
                extractNutritionData(container),
              ]);

            if (name) {
              logger.info(
                `✅ Extracted: ${name}${nameEn ? ` (${nameEn})` : ''} [Page ${pageNumber}]${nutritions ? ' with nutrition data' : ''}`
              );
              return { name, nameEn, imageUrl, description, nutritions };
            }
            return null;
          } catch (productError) {
            logger.debug(
              `⚠️ Failed to extract product ${batchStart + index + 1} on page ${pageNumber}: ${productError}`
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
      `📦 Successfully extracted ${products.length} products from page ${pageNumber} of ${categoryName}`
    );
    return products;
  } catch (extractionError) {
    logger.error(
      `❌ Failed to extract products from page ${pageNumber} of ${categoryName}: ${extractionError}`
    );
    return [];
  }
}

function createBasicProduct(
  productInfo: {
    name: string;
    nameEn: string | null;
    imageUrl: string;
    description: string | null;
    nutritions: Nutritions | null;
  },
  categoryName: string,
  pageUrl: string
): Product {
  const externalId = `coffeebean_${categoryName}_${productInfo.name}`;

  return {
    name: productInfo.name,
    nameEn: productInfo.nameEn,
    description: productInfo.description,
    price: null,
    externalImageUrl: productInfo.imageUrl,
    category: null, // Category will be set later
    externalCategory: categoryName,
    externalId,
    externalUrl: pageUrl,
    nutritions: productInfo.nutritions,
  };
}

// ================================================
// PAGE HANDLERS
// ================================================

async function handleMainMenuPage(
  page: Page,
  crawlerInstance: PlaywrightCrawler
) {
  logger.info('Processing coffeebean menu page');

  await waitForLoad(page);
  // Debug screenshot removed for performance
  // await takeDebugScreenshot(page, 'coffeebean-main-menu');

  // Try to extract categories from navigation, but fallback to processing current page
  const categories = await extractCategoriesFromMenu(page);

  if (categories.length > 0) {
    // Process discovered categories
    const categoriesToProcess = isTestMode
      ? categories.slice(0, 1)
      : categories;

    if (isTestMode) {
      logger.info(
        `🧪 Test mode: limiting to ${categoriesToProcess.length} categories`
      );
    }

    for (const category of categoriesToProcess) {
      try {
        logger.info(
          `🔖 Processing category: ${category.name} -> ${category.url}`
        );

        await page.goto(category.url);
        await waitForLoad(page);

        const products = await extractProductsFromListing(page, category.name);
        await processProducts(
          products,
          category.name,
          category.url,
          crawlerInstance
        );
      } catch (categoryError) {
        logger.error(
          `❌ Failed to process category ${category.name}: ${categoryError}`
        );
      }
    }
  } else {
    // No categories found, process current page as single category
    logger.info(
      '🔖 No categories found, processing current page as "All Items"'
    );
    const products = await extractProductsFromListing(page, 'All Items');
    await processProducts(products, 'All Items', page.url(), crawlerInstance);
  }
}

async function processProducts(
  products: Array<{
    name: string;
    nameEn: string | null;
    imageUrl: string;
    description: string | null;
    nutritions: Nutritions | null;
  }>,
  categoryName: string,
  categoryUrl: string,
  crawlerInstance: PlaywrightCrawler
) {
  // Create products directly from listing page info
  const createdProducts = products.map((product) =>
    createBasicProduct(product, categoryName, categoryUrl)
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
    `📊 Added ${createdProducts.length} products from ${categoryName}`
  );
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const createCoffeebeanCrawler = () =>
  new PlaywrightCrawler({
    launchContext: {
      launchOptions: CRAWLER_CONFIG.launchOptions,
    },
    async requestHandler({ page, crawler: crawlerInstance }) {
      await handleMainMenuPage(page, crawlerInstance);
    },
    maxConcurrency: CRAWLER_CONFIG.maxConcurrency,
    maxRequestsPerCrawl: CRAWLER_CONFIG.maxRequestsPerCrawl,
    maxRequestRetries: CRAWLER_CONFIG.maxRequestRetries,
    requestHandlerTimeoutSecs: CRAWLER_CONFIG.requestHandlerTimeoutSecs,
  });

export const runCoffeebeanCrawler = async () => {
  const crawler = createCoffeebeanCrawler();

  try {
    await crawler.run([SITE_CONFIG.startUrl]);
    const dataset = await crawler.getData();
    await writeProductsToJson(dataset.items as Product[], 'coffeebean');
  } catch (error) {
    logger.error('Coffeebean crawler failed:', error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runCoffeebeanCrawler().catch((error) => {
    logger.error('Crawler execution failed:', error);
    process.exit(1);
  });
}
