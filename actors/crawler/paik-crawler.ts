import { PlaywrightCrawler, type Request } from 'crawlee';
import type { Locator, Page } from 'playwright';
import { logger } from '../../shared/logger';
import type { Nutritions } from '../../shared/nutritions';
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
  maxItemsPerCategory: isTestMode ? maxProductsInTestMode : 200,
};

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

// Regex patterns for nutrition extraction
const NUTRITION_PATTERNS = {
  servingSize: /(\d+)\s*(ml|mL|ML|g|gram)/i,
  calories: /(\d+)\s*(kcal|칼로리|열량)/i,
  protein: /단백질.*?(\d+(?:\.\d+)?)\s*(g|gram)/i,
  fat: /지방.*?(\d+(?:\.\d+)?)\s*(g|gram)/i,
  carbohydrates: /탄수화물.*?(\d+(?:\.\d+)?)\s*(g|gram)/i,
  sugar: /당류.*?(\d+(?:\.\d+)?)\s*(g|gram)/i,
  sodium: /나트륨.*?(\d+(?:\.\d+)?)\s*(mg|milligram)/i,
  caffeine: /카페인.*?(\d+(?:\.\d+)?)\s*(mg|milligram)/i,
} as const;

function parseNutritionValue(match: RegExpMatchArray | null): number | null {
  if (!match?.[1]) {
    return null;
  }
  const value = Number.parseFloat(match[1]);
  return Number.isNaN(value) ? null : value;
}

// Extract nutrition data from .ingredient_table_box selector
async function extractNutritionData(
  menuItem: Locator
): Promise<Nutritions | null> {
  try {
    // Look for nutrition data in the ingredient table box
    const nutritionBox = menuItem.locator('.ingredient_table_box');

    // Check if nutrition box exists
    const nutritionBoxCount = await nutritionBox.count();
    if (nutritionBoxCount === 0) {
      return null;
    }

    // Extract the text content from the nutrition box
    const nutritionText = await nutritionBox.textContent().catch(() => '');

    if (!nutritionText) {
      return null;
    }

    return extractNutritionFromText(nutritionText);
  } catch (error) {
    logger.debug(
      'Failed to extract nutrition data from Paik menu item:',
      error
    );
    return null;
  }
}

// Helper function to determine serving size unit for Paik
function getPaikServingSizeUnit(
  matches: Record<string, RegExpMatchArray | null>,
  hasValue: boolean
): string | null {
  if (!hasValue) {
    return null;
  }
  const unitText = matches.servingSize?.[2]?.toLowerCase();
  return unitText?.includes('ml') ? 'ml' : 'g';
}

// Helper function to parse nutrition matches for Paik
function parsePaikNutritionMatches(nutritionText: string) {
  return {
    servingSize: nutritionText.match(NUTRITION_PATTERNS.servingSize),
    calories: nutritionText.match(NUTRITION_PATTERNS.calories),
    protein: nutritionText.match(NUTRITION_PATTERNS.protein),
    fat: nutritionText.match(NUTRITION_PATTERNS.fat),
    carbohydrates: nutritionText.match(NUTRITION_PATTERNS.carbohydrates),
    sugar: nutritionText.match(NUTRITION_PATTERNS.sugar),
    sodium: nutritionText.match(NUTRITION_PATTERNS.sodium),
    caffeine: nutritionText.match(NUTRITION_PATTERNS.caffeine),
  };
}

// Helper function to parse nutrition values for Paik
function parsePaikNutritionValues(
  matches: Record<string, RegExpMatchArray | null>
) {
  return {
    servingSize: parseNutritionValue(matches.servingSize),
    calories: parseNutritionValue(matches.calories),
    protein: parseNutritionValue(matches.protein),
    fat: parseNutritionValue(matches.fat),
    carbohydrates: parseNutritionValue(matches.carbohydrates),
    sugar: parseNutritionValue(matches.sugar),
    sodium: parseNutritionValue(matches.sodium),
    caffeine: parseNutritionValue(matches.caffeine),
  };
}

// Helper function to check if Paik has nutrition data
function hasPaikNutritionData(values: Record<string, number | null>): boolean {
  return (
    values.servingSize !== null ||
    values.calories !== null ||
    values.protein !== null ||
    values.fat !== null
  );
}

// Helper function to create Paik nutrition object
function createPaikNutritionObject(
  values: Record<string, number | null>,
  matches: Record<string, RegExpMatchArray | null>
): Nutritions {
  return {
    servingSize: values.servingSize,
    servingSizeUnit: getPaikServingSizeUnit(
      matches,
      values.servingSize !== null
    ),
    calories: values.calories,
    caloriesUnit: values.calories !== null ? 'kcal' : null,
    carbohydrates: values.carbohydrates,
    carbohydratesUnit: values.carbohydrates !== null ? 'g' : null,
    sugar: values.sugar,
    sugarUnit: values.sugar !== null ? 'g' : null,
    protein: values.protein,
    proteinUnit: values.protein !== null ? 'g' : null,
    fat: values.fat,
    fatUnit: values.fat !== null ? 'g' : null,
    transFat: null,
    transFatUnit: null,
    saturatedFat: null,
    saturatedFatUnit: null,
    natrium: values.sodium,
    natriumUnit: values.sodium !== null ? 'mg' : null,
    cholesterol: null,
    cholesterolUnit: null,
    caffeine: values.caffeine,
    caffeineUnit: values.caffeine !== null ? 'mg' : null,
  };
}

// Parse nutrition values from text content
function extractNutritionFromText(nutritionText: string): Nutritions | null {
  try {
    const matches = parsePaikNutritionMatches(nutritionText);
    const values = parsePaikNutritionValues(matches);

    if (hasPaikNutritionData(values)) {
      return createPaikNutritionObject(values, matches);
    }
  } catch (error) {
    logger.debug('Failed to parse nutrition data from text:', error);
  }
  return null;
}

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
  pageUrl: string,
  nutritions: Nutritions | null = null
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
    nutritions,
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

        const [name, imageUrl, description, nutritions] = await Promise.all([
          extractProductName(menuItem),
          extractProductImage(menuItem),
          extractProductDescription(menuItem, page),
          extractNutritionData(menuItem),
        ]);

        if (isValidProductName(name)) {
          const product = createProduct(
            name,
            imageUrl,
            description,
            categoryName,
            page.url(),
            nutritions
          );

          // Check for duplicates
          if (!products.some((p) => p.externalId === product.externalId)) {
            products.push(product);
            logger.info(
              `✅ Extracted: ${name} (${product.category})${nutritions ? ' with nutrition data' : ''}`
            );
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
