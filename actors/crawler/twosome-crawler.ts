import { PlaywrightCrawler } from 'crawlee';
import type { Locator, Page } from 'playwright';
import { logger } from '../../shared/logger';
import type { Nutritions } from '../../shared/nutritions';
import {
  type Product,
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
const SERVING_SIZE_REGEX = /1회 제공량.*?(\d+(?:\.\d+)?)\s*(ml|g)/;
const CALORIES_REGEX = /열량\s*\([^)]*\).*?(\d+(?:\.\d+)?)(?:\/\d+(?:\.\d+)?)?/;
const SUGAR_REGEX = /당류\s*\([^)]*\).*?(\d+(?:\.\d+)?)(?:\/\d+(?:\.\d+)?)?/;
const PROTEIN_REGEX =
  /단백질\s*\([^)]*\).*?(\d+(?:\.\d+)?)(?:\/\d+(?:\.\d+)?)?/;
const SATURATED_FAT_REGEX =
  /포화지방\s*\([^)]*\).*?(\d+(?:\.\d+)?)(?:\/\d+(?:\.\d+)?)?/;
const SODIUM_REGEX = /나트륨\s*\([^)]*\).*?(\d+(?:\.\d+)?)(?:\/\d+(?:\.\d+)?)?/;
const CAFFEINE_REGEX =
  /카페인\s*\([^)]*\).*?(\d+(?:\.\d+)?)(?:\/\d+(?:\.\d+)?)?/;
const NUMBER_REGEX = /(\d+(?:\.\d+)?)/;
const SERVING_UNIT_REGEX = /(\d+(?:\.\d+)?)\s*(ml|g)/;

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
  maxConcurrency: 1, // Reduce concurrency to avoid timeouts
  maxRequestsPerCrawl: isTestMode ? maxRequestsInTestMode : 50,
  maxRequestRetries: 2, // Reduce retries
  requestHandlerTimeoutSecs: isTestMode ? 60 : 180, // Reduce timeout
  navigationTimeoutSecs: 30, // Reduce navigation timeout
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
// DATA EXTRACTION FUNCTIONS
// ================================================

// Helper function to debug DL elements
async function _debugDlElements(page: Page, _menuCode: string): Promise<void> {
  const allDlElements = page.locator('dl');
  const dlCount = await allDlElements.count();
  logger.info(`📊 Found ${dlCount} dl elements total`);

  // Debug: log all dl element classes to find the correct selector
  for (let i = 0; i < Math.min(dlCount, 5); i++) {
    const dlElement = allDlElements.nth(i);
    const className = await dlElement.getAttribute('class');
    logger.info(`📋 dl[${i}] class: "${className}"`);
  }
}

// Helper function to get alternative nutrition selectors
function getAlternativeNutritionSelectors(): string[] {
  return [
    'div:has-text("290")', // Look for elements containing the calories value
    'div:has-text("27/27")', // Look for elements containing the sugar format
    'dt:has-text("열량")', // Look for DT elements with calories
    'dt:has-text("당류")', // Look for DT elements with sugar
    'dl:has-text("열량")', // DL elements containing calories
    'dl:has-text("당류")', // DL elements containing sugar
    'div.popup-cont', // Popup content areas
    'div.popup-content', // Alternative popup content
    'div[class*="nutrition"]', // Any div with nutrition in class
    'div[class*="menu-detail"]', // Menu detail divs
    'table:has-text("열량")', // Tables containing nutrition
    'ul:has-text("열량")', // Lists containing nutrition
    'dl', // Try all dl elements (last resort)
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
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: refactor later
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

    // Wait for nutrition popup to load and try to click to reveal it
    await page.waitForTimeout(3000);

    // Try multiple approaches to reveal nutrition data
    try {
      // Method 1: Click on nutrition info text
      const nutritionButton = page.getByText('제품 영양정보');
      if ((await nutritionButton.count()) > 0) {
        await nutritionButton.first().click();
        await page.waitForTimeout(1500);
      }
    } catch {
      // Method 1 failed, try other approaches
    }

    try {
      // Method 2: Look for and click nutrition popup trigger
      const popupTrigger = page.locator('[class*="popup"]').first();
      if ((await popupTrigger.count()) > 0) {
        await popupTrigger.click();
        await page.waitForTimeout(2000);
      }
    } catch {
      // Method 2 failed
    }

    // Try additional methods to reveal nutrition data
    try {
      // Method 3: Click any element containing "영양"
      const nutritionElements = page.locator(':has-text("영양")');
      for (let i = 0; i < Math.min(await nutritionElements.count(), 3); i++) {
        await nutritionElements.nth(i).click();
        await page.waitForTimeout(1000);
      }
    } catch {
      // Method 3 failed
    }

    // Method 4: Click "확인" button to confirm nutrition popup
    try {
      const confirmButton = page.getByText('확인');
      if ((await confirmButton.count()) > 0) {
        logger.info('🔘 Clicking 확인 button to reveal nutrition data');
        await confirmButton.first().click();
        await page.waitForTimeout(2000);
      }
    } catch {
      // Method 4 failed
    }

    // Method 5: Try other confirmation button patterns
    try {
      const confirmButtons = [
        page.locator('button:has-text("확인")'),
        page.locator('input[type="button"][value="확인"]'),
        page.locator('.btn:has-text("확인")'),
        page.locator('[onclick*="confirm"]'),
      ];

      for (const button of confirmButtons) {
        if ((await button.count()) > 0) {
          logger.info('🔘 Clicking confirmation button');
          await button.first().click();
          await page.waitForTimeout(1500);
          break;
        }
      }
    } catch {
      // Method 5 failed
    }

    // Debug: Check what elements are actually available
    const allDlElements = await page.locator('dl').count();
    const wrapperElements = await page.locator('.menu-detail-dl-wrap').count();
    logger.debug(
      `Debug - Found ${allDlElements} dl elements and ${wrapperElements} wrapper elements`
    );

    // Look for nutrition data in the structured DL elements
    const _nutritionContainer = page.locator('.menu-detail-dl-wrap');
    const nutritionElements = page.locator('.menu-detail-dl');
    const nutritionElementCount = await nutritionElements.count();

    logger.info(
      `📊 Found ${nutritionElementCount} .menu-detail-dl elements for ${menuCode}`
    );

    // If no structured elements found, try direct text search for the values you showed
    if (nutritionElementCount === 0) {
      logger.info('🔍 Trying to find nutrition data by direct text search');
      const pageContent = await page.content();

      // Look for the specific patterns from your HTML
      if (pageContent.includes('1회 제공량') && pageContent.includes('열량')) {
        logger.info('✅ Found nutrition keywords in page content');

        // Try to extract from page text using the exact patterns
        const nutrition: Nutritions = {};

        // Extract serving size (355ml)
        const servingMatch = pageContent.match(SERVING_SIZE_REGEX);
        if (servingMatch) {
          nutrition.servingSize = Number.parseFloat(servingMatch[1]);
          nutrition.servingSizeUnit = servingMatch[2];
        }

        // Extract calories (290) - handle both "290" and "290/290" formats
        const caloriesMatch = pageContent.match(CALORIES_REGEX);
        if (caloriesMatch) {
          nutrition.calories = Number.parseFloat(caloriesMatch[1]);
          nutrition.caloriesUnit = 'kcal';
        }

        // Extract sugar (27) - handle "27/27" format, take first number
        const sugarMatch = pageContent.match(SUGAR_REGEX);
        if (sugarMatch) {
          nutrition.sugar = Number.parseFloat(sugarMatch[1]);
          nutrition.sugarUnit = 'g';
        }

        // Extract protein (9) - handle "9/9" format, take first number
        const proteinMatch = pageContent.match(PROTEIN_REGEX);
        if (proteinMatch) {
          nutrition.protein = Number.parseFloat(proteinMatch[1]);
          nutrition.proteinUnit = 'g';
        }

        // Extract saturated fat (9) - handle "9/9" format, take first number
        const satFatMatch = pageContent.match(SATURATED_FAT_REGEX);
        if (satFatMatch) {
          nutrition.saturatedFat = Number.parseFloat(satFatMatch[1]);
          nutrition.saturatedFatUnit = 'g';
        }

        // Extract sodium (165) - handle "165/165" format, take first number
        const sodiumMatch = pageContent.match(SODIUM_REGEX);
        if (sodiumMatch) {
          nutrition.natrium = Number.parseFloat(sodiumMatch[1]);
          nutrition.natriumUnit = 'mg';
        }

        // Extract caffeine (184) - handle "184/184" format, take first number
        const caffeineMatch = pageContent.match(CAFFEINE_REGEX);
        if (caffeineMatch) {
          nutrition.caffeine = Number.parseFloat(caffeineMatch[1]);
          nutrition.caffeineUnit = 'mg';
        }

        // Check if we extracted any nutrition data
        const hasData = Object.keys(nutrition).length > 0;
        if (hasData) {
          logger.info(
            `📊 Successfully extracted nutrition data from page content for ${menuCode}`
          );
          return nutrition;
        }
        logger.info(
          `⚠️ Found nutrition keywords but failed to extract values for ${menuCode}`
        );
      }
    }

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

    // Extract structured nutrition data from DL elements
    const nutrition: Nutritions = {};

    for (let i = 0; i < nutritionElementCount; i++) {
      const dlElement = nutritionElements.nth(i);
      const dt = await dlElement.locator('dt').textContent();
      const dd = await dlElement.locator('dd').textContent();

      if (!(dt && dd)) {
        continue;
      }

      const label = dt.trim();
      const value = dd.trim();

      // Parse serving size (1회 제공량 - 355ml)
      if (label.includes('1회 제공량')) {
        const match = value.match(SERVING_UNIT_REGEX);
        if (match) {
          nutrition.servingSize = Number.parseFloat(match[1]);
          nutrition.servingSizeUnit = match[2];
        }
      }

      // Parse calories (열량 - 290 Kcal)
      else if (label.includes('열량')) {
        const match = value.match(NUMBER_REGEX);
        if (match) {
          nutrition.calories = Number.parseFloat(match[1]);
          nutrition.caloriesUnit = 'kcal';
        }
      }

      // Parse sugar (당류 - 27/27)
      else if (label.includes('당류')) {
        const match = value.match(NUMBER_REGEX);
        if (match) {
          nutrition.sugar = Number.parseFloat(match[1]);
          nutrition.sugarUnit = 'g';
        }
      }

      // Parse protein (단백질 - 9/16)
      else if (label.includes('단백질')) {
        const match = value.match(NUMBER_REGEX);
        if (match) {
          nutrition.protein = Number.parseFloat(match[1]);
          nutrition.proteinUnit = 'g';
        }
      }

      // Parse saturated fat (포화지방 - 9/60)
      else if (label.includes('포화지방')) {
        const match = value.match(NUMBER_REGEX);
        if (match) {
          nutrition.saturatedFat = Number.parseFloat(match[1]);
          nutrition.saturatedFatUnit = 'g';
        }
      }

      // Parse sodium (나트륨 - 165/8)
      else if (label.includes('나트륨')) {
        const match = value.match(NUMBER_REGEX);
        if (match) {
          nutrition.natrium = Number.parseFloat(match[1]);
          nutrition.natriumUnit = 'mg';
        }
      }

      // Parse caffeine (카페인 - 184)
      else if (label.includes('카페인')) {
        const match = value.match(NUMBER_REGEX);
        if (match) {
          nutrition.caffeine = Number.parseFloat(match[1]);
          nutrition.caffeineUnit = 'mg';
        }
      }
    }

    // Check if we extracted any nutrition data
    const hasData = Object.keys(nutrition).length > 0;
    if (hasData) {
      logger.info(
        `📊 Successfully extracted structured nutrition data for ${menuCode}`
      );
      return nutrition;
    }

    logger.info(`📊 No structured nutrition data found for ${menuCode}`);
    return null;
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
  page.setDefaultNavigationTimeout(30_000); // 30 seconds
  page.setDefaultTimeout(20_000); // 20 seconds for other operations
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

  const categories = await extractCategoriesFromMenu(page);

  if (categories.length === 0) {
    logger.error('❌ No categories found');
    return;
  }

  // Limit categories in test mode
  const categoriesToProcess = isTestMode ? categories.slice(0, 2) : categories;

  if (isTestMode) {
    logger.info(
      `🧪 Test mode: limiting to ${categoriesToProcess.length} categories`
    );
  }

  // Process each category
  for (let i = 0; i < categoriesToProcess.length; i++) {
    const categoryName = categoriesToProcess[i].name;
    try {
      logger.info(
        `📂 Processing category ${i + 1}/${categoriesToProcess.length}: ${categoryName}`
      );

      // Navigate back to main menu and re-expand for subsequent categories
      if (i > 0) {
        logger.info(
          `🔄 Navigating back to main menu for category: ${categoryName}`
        );
        await page.goto(SITE_CONFIG.startUrl);
        await waitForLoad(page);
        await page.getByText(SELECTORS.coffeeBeverage, { exact: true }).click();
        await waitFor(1000);
      }

      // Find and click the category element (fresh elements after navigation)
      const categoryElements = await page
        .locator(SELECTORS.categoryItems)
        .all();
      let categoryClicked = false;

      for (const element of categoryElements) {
        const text = await element.textContent();
        if (text?.trim() === categoryName) {
          await element.click();
          await waitForLoad(page);
          categoryClicked = true;
          break;
        }
      }

      if (!categoryClicked) {
        logger.warn(`⚠️ Could not find category element for: ${categoryName}`);
        continue;
      }

      const products = await extractProductsFromListing(page, categoryName);

      // Extract nutrition data for each product
      const createdProducts = await processProductsInCategory(
        page,
        products,
        categoryName
      );

      // Push products to crawler dataset in smaller batches to avoid blocking
      await pushProductsInBatches(createdProducts, crawlerInstance);

      logger.info(
        `📊 Added ${createdProducts.length} products from ${categoryName}`
      );
    } catch (categoryError) {
      logger.error(
        `❌ Failed to process category ${categoryName}: ${categoryError}`
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

    // Ensure proper cleanup and exit
    await crawler.teardown();
  } catch (error) {
    logger.error('Twosome crawler failed:', error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runTwosomeCrawler()
    .then(() => {
      logger.info('Crawler completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Crawler execution failed:', error);
      process.exit(1);
    });
}
