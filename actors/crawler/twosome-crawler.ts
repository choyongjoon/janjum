import { PlaywrightCrawler } from 'crawlee';
import type { Locator, Page } from 'playwright';
import { logger } from '../../shared/logger';
import type { Nutritions } from '../../shared/nutritions';
import {
  type Product,
  takeDebugScreenshot,
  waitFor,
  waitForLoad,
  writeProductsToJson,
} from './crawlerUtils';
import {
  extractNutritionFromText,
  hasNutritionKeywords,
} from './nutritionUtils';

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
  maxConcurrency: 3, // Increase concurrency for better performance
  maxRequestsPerCrawl: isTestMode ? maxRequestsInTestMode : 50,
  maxRequestRetries: 3, // Increase retries
  requestHandlerTimeoutSecs: isTestMode ? 120 : 300, // Increase timeout
  navigationTimeoutSecs: 90, // Add navigation timeout
  launchOptions: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
};

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

// Helper function to debug DL elements
async function debugDlElements(page: Page, _menuCode: string): Promise<void> {
  const allDlElements = page.locator('dl');
  const dlCount = await allDlElements.count();
  logger.info(`📊 Found ${dlCount} dl elements total`);

  // Debug: log all dl element classes to find the correct selector
  for (let i = 0; i < Math.min(dlCount, 5); i++) {
    const dlElement = allDlElements.nth(i);
    const className = await dlElement.getAttribute('class');
    const textContent = await dlElement.textContent();
    logger.info(
      `📋 dl[${i}] class: "${className}" - text preview: "${textContent?.slice(0, 100)}..."`
    );
  }
}

// Helper function to get alternative nutrition selectors
function getAlternativeNutritionSelectors(): string[] {
  return [
    'div:has-text("제품 영양정보")', // Section with nutrition info
    'div:has-text("영양성분")', // Alternative nutrition info
    'div:has-text("영양정보")', // Another nutrition info variant
    'div:has-text("칼로리")', // Section with calories
    '.nutrition-info', // Common nutrition class
    '.product-nutrition', // Product nutrition class
    '[class*="nutrition"]', // Any element with nutrition in class
    '[class*="영양"]', // Any element with 영양 in class
  ];
}

// Helper function to process elements with a selector
async function processElementsWithSelector(
  page: Page,
  selector: string,
  menuCode: string
): Promise<Nutritions | null> {
  const elements = page.locator(selector);
  const count = await elements.count();

  if (count <= 0) {
    return null;
  }

  logger.info(`📋 Found ${count} elements with selector: ${selector}`);

  for (let i = 0; i < Math.min(count, 3); i++) {
    const element = elements.nth(i);
    const textContent = await element.textContent();
    logger.info(`📝 Content preview: "${textContent?.slice(0, 150)}..."`);

    if (textContent && hasNutritionKeywords(textContent)) {
      logger.info(`📋 Found nutrition data with selector: ${selector}[${i}]`);
      const result = extractNutritionFromText(textContent);
      if (result) {
        logger.info(`📊 Successfully extracted nutrition data for ${menuCode}`);
        return result;
      }
    }
  }

  return null;
}

// Helper function to try alternative nutrition selectors
async function tryAlternativeNutritionSelectors(
  page: Page,
  menuCode: string
): Promise<Nutritions | null> {
  logger.info('🔍 Trying alternative selectors for nutrition data');

  const alternativeSelectors = getAlternativeNutritionSelectors();

  for (const selector of alternativeSelectors) {
    try {
      const result = await processElementsWithSelector(
        page,
        selector,
        menuCode
      );
      if (result) {
        return result;
      }
    } catch (selectorError) {
      logger.debug(`Selector ${selector} failed:`, selectorError);
    }
  }

  return null;
}

// Helper function to try DL elements for nutrition data
async function tryDlElementsForNutrition(
  page: Page,
  menuCode: string
): Promise<Nutritions | null> {
  const allDlElements = page.locator('dl');
  const dlCount = await allDlElements.count();

  // Try just 'dl' elements that might contain nutrition info
  for (let i = 0; i < dlCount; i++) {
    const dlElement = allDlElements.nth(i);
    const textContent = await dlElement.textContent();
    if (textContent && hasNutritionKeywords(textContent)) {
      logger.info(`📋 Found potential nutrition data in dl[${i}]`);
      const result = extractNutritionFromText(textContent);
      logger.info(
        `📊 Alternative nutrition extraction result for ${menuCode}: ${result ? 'found data' : 'no data'}`
      );
      if (result) {
        return result;
      }
    }
  }

  return null;
}

// Helper function to try page body for nutrition data
async function tryPageBodyForNutrition(
  page: Page,
  menuCode: string
): Promise<Nutritions | null> {
  logger.info('🔍 Searching entire page for nutrition keywords');
  const bodyText = await page.locator('body').textContent();
  if (bodyText && (bodyText.includes('칼로리') || bodyText.includes('kcal'))) {
    logger.info('📋 Found nutrition keywords in page body');
    const result = extractNutritionFromText(bodyText);
    if (result) {
      logger.info(`📊 Extracted nutrition data from page body for ${menuCode}`);
      return result;
    }
  }
  return null;
}

// Extract nutrition data from product detail page
async function extractNutritionDataFromDetailPage(
  page: Page,
  menuCode: string
): Promise<Nutritions | null> {
  try {
    // Navigate to product detail page
    const detailUrl = `${SITE_CONFIG.productUrlTemplate}${menuCode}`;
    logger.info(`📄 Navigating to detail page: ${detailUrl}`);
    await page.goto(detailUrl);
    await waitForLoad(page);

    // Take a screenshot for debugging (only in test mode)
    if (process.env.CRAWLER_TEST_MODE === 'true') {
      await takeDebugScreenshot(page, `twosome-detail-${menuCode}`);
    }

    // Look for nutrition data in the .menu-detail-dl selector
    const nutritionElement = page.locator('.menu-detail-dl');
    const nutritionElementCount = await nutritionElement.count();
    logger.info(
      `📊 Found ${nutritionElementCount} .menu-detail-dl elements for ${menuCode}`
    );

    // Debug DL elements
    await debugDlElements(page, menuCode);

    if (nutritionElementCount === 0) {
      // Try alternative methods to find nutrition data
      const altResult = await tryAlternativeNutritionSelectors(page, menuCode);
      if (altResult) {
        return altResult;
      }

      const dlResult = await tryDlElementsForNutrition(page, menuCode);
      if (dlResult) {
        return dlResult;
      }

      const bodyResult = await tryPageBodyForNutrition(page, menuCode);
      if (bodyResult) {
        return bodyResult;
      }

      return null;
    }

    // Extract the text content from the nutrition element
    const nutritionText = await nutritionElement.textContent().catch(() => '');
    logger.info(
      `📝 Nutrition text for ${menuCode}: ${nutritionText?.substring(0, 200) || 'empty'}`
    );

    if (!nutritionText) {
      return null;
    }

    const result = extractNutritionFromText(nutritionText);
    logger.info(
      `📊 Nutrition extraction result for ${menuCode}: ${result ? 'found data' : 'no data'}`
    );
    return result;
  } catch (error) {
    logger.debug(
      `Failed to extract nutrition data for menuCode ${menuCode}:`,
      error
    );
    return null;
  }
}

async function extractCategoriesFromMenu(
  page: Page
): Promise<Array<{ name: string; element: Locator }>> {
  try {
    logger.info('📄 Extracting categories from menu');

    await waitForLoad(page);

    // Click on "커피/음료" to expand the category
    await page.getByText(SELECTORS.coffeeBeverage, { exact: true }).click();
    await waitFor(1000);

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
  categoryName: string,
  nutritions: Nutritions | null = null
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
    nutritions,
  };
}

// ================================================
// PAGE HANDLERS
// ================================================

// Helper function to setup page timeouts
function setupPageTimeouts(page: Page): void {
  page.setDefaultNavigationTimeout(90_000); // 90 seconds
  page.setDefaultTimeout(60_000); // 60 seconds for other operations
}

// Helper function to process single product
async function processProductWithNutrition(
  page: Page,
  product: { name: string; menuCode: string },
  categoryName: string
): Promise<Product> {
  logger.info(
    `🔍 Extracting nutrition data for: ${product.name} (${product.menuCode})`
  );

  try {
    // Extract nutrition data from product detail page
    const nutritions = await extractNutritionDataFromDetailPage(
      page,
      product.menuCode
    );

    // Create product with nutrition data
    const createdProduct = createBasicProduct(
      product,
      categoryName,
      nutritions
    );

    logger.info(
      `✅ Processed: ${product.name}${nutritions ? ' with nutrition data' : ' (no nutrition data found)'}`
    );

    return createdProduct;
  } catch (error) {
    // If nutrition extraction fails, create product without nutrition data
    logger.warn(`⚠️ Failed to extract nutrition for ${product.name}:`, error);
    const createdProduct = createBasicProduct(product, categoryName, null);
    logger.info(`✅ Processed: ${product.name} (nutrition extraction failed)`);
    return createdProduct;
  }
}

// Helper function to process products in a category
async function processProductsInCategory(
  page: Page,
  products: Array<{ name: string; menuCode: string }>,
  categoryName: string
): Promise<Product[]> {
  const createdProducts: Product[] = [];

  for (const product of products) {
    const createdProduct = await processProductWithNutrition(
      page,
      product,
      categoryName
    );
    createdProducts.push(createdProduct);
  }

  return createdProducts;
}

// Helper function to push products in batches
async function pushProductsInBatches(
  products: Product[],
  crawlerInstance: PlaywrightCrawler
): Promise<void> {
  const batchSize = 10;
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    await Promise.all(
      batch.map((product) => crawlerInstance.pushData(product))
    );
  }
}

async function handleMainMenuPage(
  page: Page,
  crawlerInstance: PlaywrightCrawler
) {
  logger.info('Processing main menu page to discover categories');

  // Set longer navigation timeout for the page
  setupPageTimeouts(page);

  await waitForLoad(page);
  await takeDebugScreenshot(page, 'twosome-main-menu');

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

      // Extract nutrition data for each product
      const createdProducts = await processProductsInCategory(
        page,
        products,
        category.name
      );

      // Push products to crawler dataset in smaller batches to avoid blocking
      await pushProductsInBatches(createdProducts, crawlerInstance);

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
        await handleMainMenuPage(page, crawlerInstance);
      } catch (error) {
        logger.error(`❌ Failed to process ${request.url}: ${error}`);

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
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    });
    return response.ok || response.status === 403; // 403 might still allow crawler access
  } catch {
    return false;
  }
}

export const runTwosomeCrawler = async () => {
  const crawler = createTwosomeCrawler();

  try {
    // Check if the URL is accessible
    const isAccessible = await checkSiteAccessibility(SITE_CONFIG.startUrl);

    if (!isAccessible) {
      throw new Error('Primary URL is not accessible');
    }

    logger.info(`🌐 Starting crawler with URL: ${SITE_CONFIG.startUrl}`);

    await crawler.run([SITE_CONFIG.startUrl]);
    const dataset = await crawler.getData();
    await writeProductsToJson(dataset.items as Product[], 'twosome');
  } catch (error) {
    logger.error('Twosome crawler failed:', error);
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
