import { PlaywrightCrawler } from 'crawlee';
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
  baseUrl: 'https://www.gong-cha.co.kr',
  startUrl: 'https://www.gong-cha.co.kr/brand/menu/product?category=001001',
} as const;

// ================================================
// CSS SELECTORS
// ================================================

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
  maxConcurrency: 1, // Single concurrency for reliable modal handling
  maxRequestsPerCrawl: isTestMode ? maxRequestsInTestMode : 150,
  maxRequestRetries: 1, // Reduce retries
  requestHandlerTimeoutSecs: isTestMode ? 120 : 180, // Much longer timeout for modal interactions
  launchOptions: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
};

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

// Regex patterns for performance
const FILE_EXTENSION_REGEX = /\.[^.]*$/;

async function extractNutritionData(page: Page): Promise<Nutritions | null> {
  try {
    // Look for the nutrition table on the detail page
    const nutritionTable = page.locator('.table-list table tbody tr').first();

    if ((await nutritionTable.count()) === 0) {
      logger.warn('No nutrition table found on page');
      return null;
    }

    // Extract nutrition values from table cells
    const nutritionValues = await Promise.all([
      nutritionTable
        .locator('td')
        .nth(2)
        .textContent()
        .catch(() => ''), // Serving size (ml)
      nutritionTable
        .locator('td')
        .nth(3)
        .textContent()
        .catch(() => ''), // Calories (kcal)
      nutritionTable
        .locator('td')
        .nth(4)
        .textContent()
        .catch(() => ''), // Sugar (g)
      nutritionTable
        .locator('td')
        .nth(5)
        .textContent()
        .catch(() => ''), // Protein (g)
      nutritionTable
        .locator('td')
        .nth(6)
        .textContent()
        .catch(() => ''), // Saturated fat (g)
      nutritionTable
        .locator('td')
        .nth(7)
        .textContent()
        .catch(() => ''), // Sodium (mg)
      nutritionTable
        .locator('td')
        .nth(8)
        .textContent()
        .catch(() => ''), // Caffeine (mg)
    ]);

    const [
      servingSizeText,
      caloriesText,
      sugarText,
      proteinText,
      saturatedFatText,
      sodiumText,
      caffeineText,
    ] = nutritionValues;

    // Parse nutrition values
    const parseValue = (text: string | null): number | null => {
      if (!text || text.trim() === '' || text.trim() === '-') return null;
      const parsed = Number.parseFloat(text.trim());
      return isNaN(parsed) ? null : parsed;
    };

    const servingSize = parseValue(servingSizeText);
    const calories = parseValue(caloriesText);
    const sugar = parseValue(sugarText);
    const protein = parseValue(proteinText);
    const saturatedFat = parseValue(saturatedFatText);
    const sodium = parseValue(sodiumText);
    const caffeine = parseValue(caffeineText);

    logger.info(
      `Gongcha nutrition values: serving=${servingSizeText}, calories=${caloriesText}, sugar=${sugarText}, protein=${proteinText}, saturatedFat=${saturatedFatText}, sodium=${sodiumText}, caffeine=${caffeineText}`
    );

    const nutritions: Nutritions = {
      servingSize,
      servingSizeUnit: servingSize !== null ? 'ml' : null,
      calories,
      caloriesUnit: calories !== null ? 'kcal' : null,
      carbohydrates: null, // Gongcha doesn't provide carbohydrates data
      carbohydratesUnit: null,
      sugar,
      sugarUnit: sugar !== null ? 'g' : null,
      protein,
      proteinUnit: protein !== null ? 'g' : null,
      fat: null, // Gongcha doesn't provide total fat data
      fatUnit: null,
      transFat: null, // Gongcha doesn't provide trans fat data
      transFatUnit: null,
      saturatedFat,
      saturatedFatUnit: saturatedFat !== null ? 'g' : null,
      natrium: sodium,
      natriumUnit: sodium !== null ? 'mg' : null,
      cholesterol: null, // Gongcha doesn't provide cholesterol data
      cholesterolUnit: null,
      caffeine,
      caffeineUnit: caffeine !== null ? 'mg' : null,
    };

    // Only return nutrition data if at least one nutrition field has a value
    const hasNutritionData = Object.entries(nutritions).some(
      ([key, value]) => !key.endsWith('Unit') && value !== null
    );

    return hasNutritionData ? nutritions : null;
  } catch (error) {
    logger.error('Error extracting nutrition data from Gongcha page:', error);
    return null;
  }
}

async function extractBasicProductInfo(container: Locator) {
  const imageElement = container.locator('img').first();
  const imageSrc = await imageElement.getAttribute('src').catch(() => '');

  // Get product name from container text content
  const containerText = (await container.textContent().catch(() => '')) || '';
  const productName = containerText.replace(/\s+/g, ' ').trim();

  if (!productName) {
    return null;
  }

  return { name: productName, imageSrc };
}

async function extractDescriptionAndNutritionFromDetailPage(
  page: Page,
  productLink: Locator,
  productName: string
): Promise<{ description: string; nutritions: Nutritions | null }> {
  try {
    const href = await productLink.getAttribute('href').catch(() => '');
    logger.info(
      `Extracting description and nutrition for: ${productName} (href: ${href})`
    );

    await productLink.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    await productLink.click({ timeout: 8000 });
    await page.waitForTimeout(2000); // Wait longer for page to fully load

    // Only take screenshot in test mode for debugging
    if (isTestMode) {
      await takeDebugScreenshot(
        page,
        `gongcha-detail-${productName.replace(/\s+/g, '_')}`
      );
    }

    // Extract description - look for the main product description paragraph
    let description = '';
    const descElement = page.locator('.text-a .t2').first();
    if ((await descElement.count()) > 0) {
      description = (await descElement.textContent()) || '';
      description = description.trim();
    }

    if (!description) {
      // Fallback: Look for description paragraphs
      const descElements = page.locator('p');
      const descCount = await descElements.count();

      for (let i = 0; i < descCount; i++) {
        const text = (await descElements.nth(i).textContent()) || '';
        const trimmed = text.trim();

        // Look for meaningful product descriptions (longer than 20 chars, not navigation text)
        if (
          trimmed.length > 20 &&
          !trimmed.includes('Follow us') &&
          !trimmed.includes('Menu') &&
          !trimmed.includes('공차') &&
          (trimmed.includes('티') ||
            trimmed.includes('스무디') ||
            trimmed.includes('밀크'))
        ) {
          description = trimmed;
          break;
        }
      }
    }

    // Extract nutrition data
    const nutritions = await extractNutritionData(page);

    if (description) {
      logger.info(`Found description: "${description.substring(0, 50)}..."`);
    } else {
      logger.warn(`No description found for ${productName}`);
    }

    return { description: description || '', nutritions };
  } catch (error) {
    logger.error(`Navigation failed for ${productName}: ${error}`);
    return { description: '', nutritions: null };
  }
}

function generateExternalId(imageSrc: string): string {
  if (imageSrc) {
    const idFromImage = imageSrc
      .split('/')
      .pop()
      ?.replace(FILE_EXTENSION_REGEX, '');
    if (idFromImage) {
      return idFromImage;
    }
  }
  return `gongcha_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

async function extractProductFromContainer(
  page: Page,
  container: Locator,
  categoryName: string
): Promise<Product | null> {
  try {
    const basicInfo = await extractBasicProductInfo(container);
    if (!basicInfo) {
      logger.warn('Could not extract product name from container');
      return null;
    }

    const { name: productName, imageSrc } = basicInfo;
    const productLink = container.locator('a[href*="detail"]').first();

    // Store current page URL to navigate back
    const currentUrl = page.url();

    const { description, nutritions } =
      await extractDescriptionAndNutritionFromDetailPage(
        page,
        productLink,
        productName
      );

    // Navigate back to the category page
    await page.goto(currentUrl);
    await page.waitForTimeout(1000);

    const externalId = generateExternalId(imageSrc || '');

    const product: Product = {
      name: productName,
      nameEn: null,
      description: description || null,
      externalCategory: categoryName,
      externalId,
      externalImageUrl: imageSrc
        ? new URL(imageSrc, SITE_CONFIG.baseUrl).href
        : '',
      externalUrl: currentUrl,
      price: null,
      category: categoryName,
      nutritions,
    };

    return product;
  } catch (error) {
    logger.error(`Error extracting product from container: ${error}`);
    return null;
  }
}

// ================================================
// PAGE HANDLERS
// ================================================

async function extractCategoryName(page: Page): Promise<string> {
  try {
    // First try to get the active tab name (subcategory)
    const activeTabText = await page
      .locator('.tabWrap ul li.active a')
      .textContent()
      .catch(() => '');

    if (activeTabText?.trim()) {
      const categoryName = activeTabText.trim();
      logger.info(`Category name from active tab: ${categoryName}`);
      return categoryName;
    }
  } catch (error) {
    logger.warn(`Could not extract category name from page: ${error}`);
  }

  return 'New 시즌 메뉴'; // Default fallback
}

async function extractProductsFromPage(
  page: Page,
  categoryName: string
): Promise<Product[]> {
  const products: Product[] = [];

  // Wait for products to load
  await page.waitForTimeout(1000);

  // Find product containers - look for list items that contain product detail links
  const productContainers = await page
    .locator('li')
    .filter({
      has: page.locator('a[href*="detail"]'),
    })
    .all();

  logger.info(
    `Found ${productContainers.length} product containers in category: ${categoryName}`
  );

  for (const container of productContainers) {
    if (isTestMode && products.length >= maxProductsInTestMode) {
      break;
    }

    const product = await extractProductFromContainer(
      page,
      container,
      categoryName
    );

    if (product) {
      products.push(product);
      logger.info(`✅ Extracted: ${product.name} (${categoryName})`);
    }

    // Small delay between products to avoid overwhelming the server
    await page.waitForTimeout(1000);
  }

  return products;
}

async function handleStartPage(
  page: Page,
  crawlerInstance: PlaywrightCrawler
): Promise<void> {
  logger.info(
    'Processing Gongcha start page - extracting all subcategory URLs and processing current page products'
  );

  await waitForLoad(page);
  await takeDebugScreenshot(page, 'gongcha-start-page');

  try {
    // First, process products on the current page (since start page is a category page)
    const categoryName = await extractCategoryName(page);
    const products = await extractProductsFromPage(page, categoryName);

    // Limit products in test mode
    const productsToProcess = isTestMode
      ? products.slice(0, maxProductsInTestMode)
      : products;

    if (isTestMode) {
      logger.info(
        `🧪 Test mode: limiting to ${productsToProcess.length} products from start page`
      );
    }

    // Push products from start page to crawler
    for (const product of productsToProcess) {
      await crawlerInstance.pushData(product);
    }

    logger.info(
      `Processed ${productsToProcess.length} products from start page (${categoryName})`
    );

    // Get all subcategory URLs
    const categoryUrls = extractCategoryUrlsFromPage(page);

    if (categoryUrls.length === 0) {
      logger.error('No category URLs found');
      return;
    }

    const currentUrl = page.url();

    // Add all subcategory URLs to the request queue, except the current one since we already processed it
    for (const url of categoryUrls) {
      if (url !== currentUrl) {
        await crawlerInstance.addRequests([{ url, label: 'category' }]);
        logger.info(`Added subcategory URL to queue: ${url}`);
      } else {
        logger.info(`Skipping current URL (already processed): ${url}`);
      }
    }

    logger.info(
      `Successfully queued ${categoryUrls.filter((url) => url !== currentUrl).length} additional subcategory pages`
    );
  } catch (error) {
    logger.error(`Error processing start page: ${error}`);
  }
}

async function handleCategoryPage(
  page: Page,
  crawlerInstance: PlaywrightCrawler
): Promise<void> {
  logger.info('Processing Gongcha subcategory page');

  await waitForLoad(page);
  await takeDebugScreenshot(page, 'gongcha-subcategory');

  try {
    const categoryName = await extractCategoryName(page);
    const products = await extractProductsFromPage(page, categoryName);

    // Limit products in test mode
    const productsToProcess = isTestMode
      ? products.slice(0, maxProductsInTestMode)
      : products;

    if (isTestMode) {
      logger.info(
        `🧪 Test mode: limiting to ${productsToProcess.length} products`
      );
    }

    // Push products to crawler
    for (const product of productsToProcess) {
      await crawlerInstance.pushData(product);
    }

    logger.info(
      `Processed ${productsToProcess.length} products from Gongcha subcategory: ${categoryName}`
    );
  } catch (error) {
    logger.error(`Error extracting products from subcategory page: ${error}`);
  }
}

// ================================================
// CATEGORY URL EXTRACTION
// ================================================

function extractAllCategoryUrls(): { url: string; name: string }[] {
  // Pre-defined list of all subcategories based on the site structure
  const allCategories = [
    // 음료 subcategories
    { categoryCode: '001001', name: 'New 시즌 메뉴', mainCategory: '음료' },
    { categoryCode: '001002', name: '베스트셀러', mainCategory: '음료' },
    { categoryCode: '001006', name: '밀크티', mainCategory: '음료' },
    { categoryCode: '001010', name: '스무디', mainCategory: '음료' },
    { categoryCode: '001003', name: '오리지널 티', mainCategory: '음료' },
    { categoryCode: '001015', name: '프룻티&모어', mainCategory: '음료' },
    { categoryCode: '001011', name: '커피', mainCategory: '음료' },
    // 푸드 subcategories
    { categoryCode: '002001', name: '베이커리', mainCategory: '푸드' },
    { categoryCode: '002004', name: '스낵', mainCategory: '푸드' },
    { categoryCode: '002006', name: '아이스크림', mainCategory: '푸드' },
    // MD상품 subcategories
    { categoryCode: '003001', name: '비식품', mainCategory: 'MD상품' },
    { categoryCode: '003002', name: '식품', mainCategory: 'MD상품' },
  ];

  return allCategories.map((cat) => ({
    url: `${SITE_CONFIG.baseUrl}/brand/menu/product?category=${cat.categoryCode}`,
    name: cat.name,
  }));
}

function extractCategoryUrlsFromPage(_page: Page): string[] {
  try {
    logger.info('Using pre-defined subcategory URLs...');

    const allCategories = extractAllCategoryUrls();
    const categoryUrls = allCategories.map((cat) => cat.url);

    logger.info(`Total subcategories: ${categoryUrls.length}`);
    for (const cat of allCategories) {
      logger.info(`Category: ${cat.name} -> ${cat.url}`);
    }

    return categoryUrls;
  } catch (error) {
    logger.error(`Error extracting category URLs: ${error}`);
    return [];
  }
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const createGongchaCrawler = () =>
  new PlaywrightCrawler({
    launchContext: {
      launchOptions: CRAWLER_CONFIG.launchOptions,
    },
    async requestHandler({ page, request, crawler: crawlerInstance }) {
      const currentUrl = page.url();
      const label = request.label || 'start';

      logger.info(`Processing page with label: ${label}, URL: ${currentUrl}`);

      if (label === 'category') {
        await handleCategoryPage(page, crawlerInstance);
      } else {
        // This is the start page - extract category URLs
        await handleStartPage(page, crawlerInstance);
      }
    },
    maxConcurrency: CRAWLER_CONFIG.maxConcurrency,
    maxRequestsPerCrawl: CRAWLER_CONFIG.maxRequestsPerCrawl,
    maxRequestRetries: CRAWLER_CONFIG.maxRequestRetries,
    requestHandlerTimeoutSecs: CRAWLER_CONFIG.requestHandlerTimeoutSecs,
  });

export const runGongchaCrawler = async () => {
  try {
    logger.info('🚀 Starting Gongcha crawler with all subcategories');

    // Step 1: Create crawler and start with the initial URL
    const crawler = createGongchaCrawler();

    // Step 2: Start crawling from the main menu page
    // The crawler will extract all subcategory URLs, then crawl each subcategory
    await crawler.run([SITE_CONFIG.startUrl]);

    const dataset = await crawler.getData();
    await writeProductsToJson(dataset.items as Product[], 'gongcha');

    logger.info(
      `✅ Successfully crawled all subcategories: ${dataset.items.length} total products`
    );
  } catch (error) {
    logger.error('Gongcha crawler failed:', error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runGongchaCrawler().catch((error) => {
    logger.error('Crawler execution failed:', error);
    process.exit(1);
  });
}
