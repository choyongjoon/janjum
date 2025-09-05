import { PlaywrightCrawler } from 'crawlee';
import type { Locator, Page } from 'playwright';
import { logger } from '../../shared/logger';
import type { Nutritions } from '../../shared/nutritions';
import { type Product, waitForLoad, writeProductsToJson } from './crawlerUtils';

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
  maxConcurrency: isTestMode ? 1 : 3, // Increase concurrency for production
  maxRequestsPerCrawl: isTestMode ? maxRequestsInTestMode : 150,
  maxRequestRetries: 1,
  requestHandlerTimeoutSecs: isTestMode ? 60 : 90, // Reduced timeout
  launchOptions: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
    ],
  },
};

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

// Regex patterns for performance
const FILE_EXTENSION_REGEX = /\.[^.]*$/;
const NUMERIC_REGEX = /^\d+$/;
const DECIMAL_NUMERIC_REGEX = /^\d*\.?\d+$/;
const UNIT_EXTRACTION_REGEX = /\(([^)]+)\)/;

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: refactor later
async function extractNutritionData(page: Page): Promise<Nutritions | null> {
  try {
    // Look for the nutrition table on the detail page
    const nutritionTable = page.locator('.table-list table');

    if ((await nutritionTable.count()) === 0) {
      logger.warn('No nutrition table found on page');
      return null;
    }

    // Extract both headers and values using batch evaluation for better performance
    const nutritionData = await page.evaluate(() => {
      const table = document.querySelector('.table-list table');
      if (!table) {
        return { tableHeaders: [], tableRows: [] };
      }

      // Get headers from thead
      const headerCells = table.querySelectorAll('thead tr th');
      const tableHeaders = Array.from(headerCells).map(
        (cell) => cell.textContent?.trim().replace(/\s+/g, ' ') || ''
      );

      // Get all rows from tbody
      const bodyRows = table.querySelectorAll('tbody tr');
      const tableRows = Array.from(bodyRows).map((row) => {
        const cells = row.querySelectorAll('td');
        return Array.from(cells).map((cell) => cell.textContent?.trim() || '');
      });

      return { tableHeaders, tableRows };
    });

    const { tableHeaders: headers, tableRows: allRows } = nutritionData;

    if (headers.length === 0 || allRows.length === 0) {
      logger.warn('No nutrition data found in table');
      return null;
    }

    logger.info(`Gongcha nutrition headers: ${headers.join(', ')}`);
    logger.info(
      `Gongcha nutrition all rows: ${allRows.map((row) => `[${row.join(', ')}]`).join(' | ')}`
    );

    // Convert table to object format by finding the best row with most complete nutrition data
    let bestNutritionData: { [key: string]: string | number } = {};
    let bestScore = 0;

    for (const row of allRows) {
      if (row.length === 0) {
        continue;
      }

      // Create object from this row
      const rowData: { [key: string]: string | number } = {};

      // Handle the first column(s) which might be category info like "Cold L" or "Hot J"
      let categoryInfo = '';
      let dataStartIndex = 0;

      // Find where the actual numeric nutrition data starts
      for (let i = 0; i < row.length; i++) {
        if (DECIMAL_NUMERIC_REGEX.test(row[i])) {
          dataStartIndex = i;
          break;
        }
        categoryInfo += (categoryInfo ? ' ' : '') + row[i];
      }

      // Add category info
      if (categoryInfo && headers.length > 0) {
        rowData[headers[0]] = categoryInfo;
      }

      // Map the remaining headers to data values
      let headerIndex = 1; // Start from second header since first is category
      for (
        let i = dataStartIndex;
        i < row.length && headerIndex < headers.length;
        i++, headerIndex++
      ) {
        const header = headers[headerIndex];
        const value = row[i];

        // Try to parse as number if it looks numeric
        if (DECIMAL_NUMERIC_REGEX.test(value)) {
          rowData[header] = Number.parseFloat(value);
        } else {
          rowData[header] = value;
        }
      }

      // Score this row based on how many numeric nutrition values it has
      let score = 0;
      for (const [_key, value] of Object.entries(rowData)) {
        if (typeof value === 'number' && value > 0) {
          score++;
        }
      }

      // Prefer rows with more complete nutrition data
      if (score > bestScore) {
        bestScore = score;
        bestNutritionData = rowData;
      }

      logger.info(`Row data: ${JSON.stringify(rowData)}, Score: ${score}`);
    }

    if (Object.keys(bestNutritionData).length === 0) {
      logger.warn('No valid nutrition data found in any row');
      return null;
    }

    logger.info(`Best nutrition data: ${JSON.stringify(bestNutritionData)}`);

    // Create a mapping from headers to values using the best row
    const nutritionMap = new Map<string, string>();
    for (const [key, value] of Object.entries(bestNutritionData)) {
      nutritionMap.set(key, String(value));
    }

    // Parse nutrition values
    const parseValue = (text: string | null): number | null => {
      if (!text || text.trim() === '' || text.trim() === '-') {
        return null;
      }
      const parsed = Number.parseFloat(text.trim());
      return Number.isNaN(parsed) ? null : parsed;
    };

    // Map headers to nutrition fields based on Korean text
    // Handle both possible serving size units
    let servingSizeText = '';
    let servingSizeUnit = '';

    // Try different variations of serving size headers (with/without spaces)
    const servingSizeHeaders = [
      '1회 제공량(g)',
      '1회 제공량 (g)',
      '1회 제공량(ml)',
      '1회 제공량 (ml)',
    ];

    for (const header of servingSizeHeaders) {
      if (nutritionMap.has(header)) {
        servingSizeText = nutritionMap.get(header) || '';
        // Extract unit from header
        const unitMatch = header.match(UNIT_EXTRACTION_REGEX);
        servingSizeUnit = unitMatch ? unitMatch[1] : 'g';
        break;
      }
    }

    // If still not found, try pattern matching
    if (!servingSizeText) {
      for (const [header, value] of nutritionMap) {
        if (header.includes('1회 제공량')) {
          servingSizeText = value;
          // Extract unit from header like '1회 제공량(g)' or '1회 제공량(ml)'
          const unitMatch = header.match(UNIT_EXTRACTION_REGEX);
          servingSizeUnit = unitMatch ? unitMatch[1] : 'g';
          break;
        }
      }
    }

    // The table structure issue: when serving size column shows size indicators (L, J),
    // we need to skip that and find actual numeric serving size data
    // Let's try a different approach - look for a row that has numeric serving size

    // If serving size is not numeric (like 'L', 'J'), try to find actual serving size from other rows
    if (!(servingSizeText && NUMERIC_REGEX.test(servingSizeText))) {
      logger.info(
        `Serving size '${servingSizeText}' is not numeric, looking for alternative rows...`
      );

      // Look for alternative rows that might have numeric serving sizes
      for (const row of allRows) {
        if (row.length >= headers.length) {
          const rowMap = new Map<string, string>();
          for (let i = 0; i < Math.min(headers.length, row.length); i++) {
            rowMap.set(headers[i], row[i]);
          }

          // Check if this row has a numeric serving size
          for (const header of servingSizeHeaders) {
            const value = rowMap.get(header);
            if (value && NUMERIC_REGEX.test(value)) {
              servingSizeText = value;
              const unitMatch = header.match(UNIT_EXTRACTION_REGEX);
              servingSizeUnit = unitMatch ? unitMatch[1] : 'ml';

              // Update nutritionMap to this row's values
              nutritionMap.clear();
              for (let i = 0; i < Math.min(headers.length, row.length); i++) {
                nutritionMap.set(headers[i], row[i]);
              }

              logger.info(
                `Found numeric serving size in alternative row: ${servingSizeText}${servingSizeUnit}`
              );
              break;
            }
          }

          if (servingSizeText && NUMERIC_REGEX.test(servingSizeText)) {
            break;
          }
        }
      }
    }

    // Map other nutrition fields with various possible formats (with/without spaces)
    const caloriesText =
      nutritionMap.get('열량(kcal)') || nutritionMap.get('열량 (kcal)') || '';
    const sodiumText =
      nutritionMap.get('나트륨(mg)') || nutritionMap.get('나트륨 (mg)') || '';
    const sugarText =
      nutritionMap.get('당류(g)') || nutritionMap.get('당류 (g)') || '';
    const saturatedFatText =
      nutritionMap.get('포화지방(g)') || nutritionMap.get('포화지방 (g)') || '';
    const proteinText =
      nutritionMap.get('단백질(g)') || nutritionMap.get('단백질 (g)') || '';
    const caffeineText =
      nutritionMap.get('카페인(mg)') || nutritionMap.get('카페인 (mg)') || '';

    const servingSize = parseValue(servingSizeText);
    const calories = parseValue(caloriesText);
    const sodium = parseValue(sodiumText);
    const sugar = parseValue(sugarText);
    const saturatedFat = parseValue(saturatedFatText);
    const protein = parseValue(proteinText);
    const caffeine = parseValue(caffeineText);

    logger.info(
      `Gongcha final nutrition values: serving=${servingSize}${servingSizeUnit}, calories=${calories}kcal, sodium=${sodium}mg, sugar=${sugar}g, saturatedFat=${saturatedFat}g, protein=${protein}g, caffeine=${caffeine}mg`
    );

    const nutritions: Nutritions = {
      servingSize: servingSize ?? undefined,
      servingSizeUnit: servingSize !== null ? servingSizeUnit : undefined,
      calories: calories ?? undefined,
      caloriesUnit: calories !== null ? 'kcal' : undefined,
      carbohydrates: undefined, // Gongcha doesn't provide carbohydrates data
      carbohydratesUnit: undefined,
      sugar: sugar ?? undefined,
      sugarUnit: sugar !== null ? 'g' : undefined,
      protein: protein ?? undefined,
      proteinUnit: protein !== null ? 'g' : undefined,
      fat: undefined, // Gongcha doesn't provide total fat data
      fatUnit: undefined,
      transFat: undefined, // Gongcha doesn't provide trans fat data
      transFatUnit: undefined,
      saturatedFat: saturatedFat ?? undefined,
      saturatedFatUnit: saturatedFat !== null ? 'g' : undefined,
      natrium: sodium ?? undefined,
      natriumUnit: sodium !== null ? 'mg' : undefined,
      cholesterol: undefined, // Gongcha doesn't provide cholesterol data
      cholesterolUnit: undefined,
      caffeine: caffeine ?? undefined,
      caffeineUnit: caffeine !== null ? 'mg' : undefined,
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

// Helper function to navigate to product detail page
async function navigateToProductDetail(
  page: Page,
  productLink: Locator,
  productName: string
): Promise<void> {
  const href = await productLink.getAttribute('href').catch(() => '');
  logger.info(
    `Extracting description and nutrition for: ${productName} (href: ${href})`
  );

  await productLink.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200); // Reduced wait time

  await productLink.click({ timeout: 5000 });
  await page.waitForTimeout(1000); // Reduced wait time

  // Skip screenshots for better performance
  // if (isTestMode) {
  //   await takeDebugScreenshot(
  //     page,
  //     `gongcha-detail-${productName.replace(/\s+/g, '_')}`
  //   );
  // }
}

// Helper function to check if text is a valid product description
function isValidProductDescription(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.length > 20 &&
    !trimmed.includes('Follow us') &&
    !trimmed.includes('Menu') &&
    !trimmed.includes('공차') &&
    (trimmed.includes('티') ||
      trimmed.includes('스무디') ||
      trimmed.includes('밀크'))
  );
}

// Helper function to extract description from main element
async function extractMainDescription(page: Page): Promise<string> {
  const descElement = page.locator('.text-a .t2').first();
  if ((await descElement.count()) > 0) {
    const description = (await descElement.textContent()) || '';
    return description.trim();
  }
  return '';
}

// Helper function to extract description from fallback elements
async function extractFallbackDescription(page: Page): Promise<string> {
  const descElements = page.locator('p');
  const descCount = await descElements.count();

  for (let i = 0; i < descCount; i++) {
    const text = (await descElements.nth(i).textContent()) || '';
    if (isValidProductDescription(text)) {
      return text.trim();
    }
  }
  return '';
}

// Helper function to extract complete product description
async function extractProductDescription(page: Page): Promise<string> {
  let description = await extractMainDescription(page);

  if (!description) {
    description = await extractFallbackDescription(page);
  }

  return description;
}

async function extractDescriptionAndNutritionFromDetailPage(
  page: Page,
  productLink: Locator,
  productName: string
): Promise<{ description: string; nutritions: Nutritions | null }> {
  try {
    await navigateToProductDetail(page, productLink, productName);

    const description = await extractProductDescription(page);
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

    // Get the product detail URL before navigation
    const productHref = await productLink.getAttribute('href').catch(() => '');
    const productDetailUrl = productHref
      ? new URL(productHref, SITE_CONFIG.baseUrl).href
      : currentUrl;

    const { description, nutritions } =
      await extractDescriptionAndNutritionFromDetailPage(
        page,
        productLink,
        productName
      );

    // Navigate back to the category page
    await page.goto(currentUrl);
    await page.waitForTimeout(500); // Reduced wait time

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
      externalUrl: productDetailUrl,
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
  await page.waitForTimeout(500); // Reduced wait time

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
    await page.waitForTimeout(300); // Reduced delay
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
  // Skip debug screenshot for better performance
  // await takeDebugScreenshot(page, 'gongcha-start-page');

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
  // Skip debug screenshot for better performance
  // await takeDebugScreenshot(page, 'gongcha-subcategory');

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
