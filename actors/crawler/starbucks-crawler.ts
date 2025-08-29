import { PlaywrightCrawler, type Request } from 'crawlee';
import type { Page } from 'playwright';
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
  baseUrl: 'https://www.starbucks.co.kr',
  startUrl: 'https://www.starbucks.co.kr/menu/drink_list.do',
  productUrlTemplate:
    'https://www.starbucks.co.kr/menu/drink_view.do?product_cd=',
} as const;

// ================================================
// CSS SELECTORS
// ================================================

const SELECTORS = {
  // Product listing page selectors
  productLinks: [
    'a.goDrinkView',
    'a[href*="drink_view.do"]',
    'a[href*="product_cd"]',
    '.product-item a',
    '.drink-item a',
    'a[onclick*="goDrinkView"]',
  ],

  // Product detail page selectors
  productDetails: {
    name: '.myAssignZone > h4',
    nameEn: '.myAssignZone > h4 > span',
    description: '.myAssignZone p.t1',
    category: '.cate',
    image: '.elevatezoom-gallery > img:first-child',
  },
} as const;

// ================================================
// REGEX PATTERNS
// ================================================

const PATTERNS = {
  productCode: /\[(\d+)\]/,
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
  : 200;

const CRAWLER_CONFIG = {
  maxConcurrency: 5, // Increased from 3 to 5
  maxRequestsPerCrawl: isTestMode ? maxRequestsInTestMode : 300, // Increased to 300 to handle all products (183 found + buffer)
  maxRequestRetries: 2,
  requestHandlerTimeoutSecs: isTestMode ? 20 : 45, // Increased timeout for better success rate
  launchOptions: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
};

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

async function extractNutritionData(page: Page): Promise<Nutritions | null> {
  try {
    // Wait for the page to fully load and for AJAX requests to complete
    await page.waitForTimeout(5000);

    // Take a debug screenshot to see the page state
    await takeDebugScreenshot(page, 'nutrition-debug');

    // First check if nutrition data is available by checking the serving size element
    const hasNutritionInfo =
      (await page.locator('#product_info01').count()) > 0;

    if (!hasNutritionInfo) {
      logger.warn('No nutrition info section found on page');
      return null;
    }

    // Wait for nutrition content to be populated
    await page
      .waitForFunction(
        () => {
          const servingElement = document.querySelector('#product_info01');
          return (
            servingElement &&
            servingElement.textContent &&
            servingElement.textContent.trim().length > 0
          );
        },
        { timeout: 10_000 }
      )
      .catch(() => {
        logger.warn('Serving size not populated within timeout');
      });

    // Extract serving size information
    const servingText = await page.locator('#product_info01').textContent();
    logger.info(`Serving size text: ${servingText}`);

    const servingMatch = servingText?.match(/(\d+)ml/);
    const servingSize = servingMatch
      ? Number.parseInt(servingMatch[1])
      : undefined;

    // Check if nutrition values are populated (they might be loaded via AJAX)
    const caloriesText = await page
      .locator('.product_info_content li.kcal dd')
      .textContent()
      .catch(() => '');
    const proteinText = await page
      .locator('.product_info_content li.protein dd')
      .textContent()
      .catch(() => '');

    logger.info(
      `Calories text: '${caloriesText}', Protein text: '${proteinText}'`
    );

    // If nutrition values are empty or not loaded, return minimal data with serving size
    if (
      (!caloriesText ||
        caloriesText.trim() === '' ||
        caloriesText.trim() === '-') &&
      (!proteinText || proteinText.trim() === '' || proteinText.trim() === '-')
    ) {
      // Return basic serving size info if available
      if (servingSize) {
        return {
          servingSize,
          servingSizeUnit: 'ml',
        };
      }

      return null;
    }

    // Parse nutrition values
    const parseValue = (text: string | null): number | null => {
      if (!text || text.trim() === '' || text.trim() === '-') return null;
      const parsed = Number.parseFloat(text.trim());
      return isNaN(parsed) ? null : parsed;
    };

    // Extract all nutrition values
    const nutritionValues = await Promise.all([
      page
        .locator('.product_info_content li.kcal dd')
        .textContent()
        .catch(() => ''),
      page
        .locator('.product_info_content li.protein dd')
        .textContent()
        .catch(() => ''),
      page
        .locator('.product_info_content li.fat dd')
        .textContent()
        .catch(() => ''),
      page
        .locator('.product_info_content li.sat_FAT dd')
        .textContent()
        .catch(() => ''),
      page
        .locator('.product_info_content li.trans_FAT dd')
        .textContent()
        .catch(() => ''),
      page
        .locator('.product_info_content li.cholesterol dd')
        .textContent()
        .catch(() => ''),
      page
        .locator('.product_info_content li.sodium dd')
        .textContent()
        .catch(() => ''),
      page
        .locator('.product_info_content li.sugars dd')
        .textContent()
        .catch(() => ''),
      page
        .locator('.product_info_content li.chabo dd')
        .textContent()
        .catch(() => ''), // carbohydrates
      page
        .locator('.product_info_content li.caffeine dd')
        .textContent()
        .catch(() => ''),
    ]);

    const [
      calories,
      protein,
      fat,
      saturatedFat,
      transFat,
      cholesterol,
      sodium,
      sugar,
      carbohydrates,
      caffeine,
    ] = nutritionValues;

    const nutritions: Nutritions = {
      servingSize,
      servingSizeUnit: servingSize !== null ? 'ml' : null,
      calories: parseValue(calories),
      caloriesUnit: parseValue(calories) !== null ? 'kcal' : null,
      carbohydrates: parseValue(carbohydrates),
      carbohydratesUnit: parseValue(carbohydrates) !== null ? 'g' : null,
      sugar: parseValue(sugar),
      sugarUnit: parseValue(sugar) !== null ? 'g' : null,
      protein: parseValue(protein),
      proteinUnit: parseValue(protein) !== null ? 'g' : null,
      fat: parseValue(fat),
      fatUnit: parseValue(fat) !== null ? 'g' : null,
      transFat: parseValue(transFat),
      transFatUnit: parseValue(transFat) !== null ? 'g' : null,
      saturatedFat: parseValue(saturatedFat),
      saturatedFatUnit: parseValue(saturatedFat) !== null ? 'g' : null,
      natrium: parseValue(sodium),
      natriumUnit: parseValue(sodium) !== null ? 'mg' : null,
      cholesterol: parseValue(cholesterol),
      cholesterolUnit: parseValue(cholesterol) !== null ? 'mg' : null,
      caffeine: parseValue(caffeine),
      caffeineUnit: parseValue(caffeine) !== null ? 'mg' : null,
    };

    // Log the extracted values
    logger.info(`Extracted nutrition data: ${JSON.stringify(nutritions)}`);

    // Only return nutrition data if at least one nutrition field has a value
    const hasNutritionData = Object.entries(nutritions).some(
      ([key, value]) => !key.endsWith('Unit') && value !== null
    );

    return hasNutritionData ? nutritions : null;
  } catch (error) {
    logger.error('Error extracting nutrition data:', error);
    return null;
  }
}

async function extractProductData(page: Page): Promise<Product> {
  const [
    name,
    nameEn,
    description,
    externalCategory,
    externalImageUrl,
    externalId,
    externalUrl,
  ] = await Promise.all([
    page
      .locator(SELECTORS.productDetails.name)
      .textContent()
      .then((text) => text?.trim() || ''),
    page
      .locator(SELECTORS.productDetails.nameEn)
      .textContent()
      .then((text) => text?.trim() || ''),
    page
      .locator(SELECTORS.productDetails.description)
      .first()
      .textContent()
      .then((text) => text?.trim() || ''),
    page
      .locator(SELECTORS.productDetails.category)
      .textContent()
      .then((text) => text?.trim() || ''),
    page
      .locator(SELECTORS.productDetails.image)
      .first()
      .getAttribute('src')
      .catch(() => '')
      .then((src) => src || ''),
    Promise.resolve(page.url()).then((url) => {
      const urlParams = new URLSearchParams(new URL(url).search);
      return urlParams.get('product_cd') || '';
    }),
    Promise.resolve(page.url()),
  ]);

  // Clean Korean name by removing English part
  let cleanName = name;
  if (nameEn && name.includes(nameEn)) {
    cleanName = name.replace(nameEn, '').trim();
  }

  // Extract nutrition data
  const nutritions = await extractNutritionData(page);

  return {
    name: cleanName,
    nameEn,
    description,
    externalCategory,
    externalId,
    externalImageUrl,
    externalUrl,
    price: null,
    category: 'Drinks',
    nutritions,
  };
}

function extractProductIdFromLink(
  href: string,
  onclick: string,
  innerHTML: string
): string[] {
  const extractedIds: string[] = [];

  // Try to extract product ID from href
  if (href?.includes('drink_view.do')) {
    const match = href.match(PATTERNS.productCode);
    if (match) {
      extractedIds.push(match[1]);
    }
  }

  // Try to extract product ID from onclick
  if (onclick?.includes('product_cd')) {
    const match = onclick.match(PATTERNS.productCode);
    if (match) {
      extractedIds.push(match[1]);
    }
  }

  // Extract product ID from image src in innerHTML
  if (innerHTML) {
    const imgMatch = innerHTML.match(PATTERNS.productCode);
    if (imgMatch) {
      extractedIds.push(imgMatch[1]);
    }
  }

  return extractedIds;
}

async function extractProductIds(page: Page) {
  let links: ReturnType<typeof page.locator> | null = null;
  let usedSelector = '';

  // Try each selector until we find one that works
  const selectorPromises = SELECTORS.productLinks.map(async (selector) => {
    const foundLinks = page.locator(selector);
    const count = await foundLinks.count();
    return { selector, foundLinks, count };
  });

  const selectorResults = await Promise.all(selectorPromises);
  for (const result of selectorResults) {
    if (result.count > 0) {
      links = result.foundLinks;
      usedSelector = result.selector;
      break;
    }
  }

  const ids: string[] = [];
  let linksFound = 0;

  if (links) {
    linksFound = await links.count();

    // Process all links to extract product IDs in parallel
    const linkProcessPromises = Array.from(
      { length: linksFound },
      async (_, i) => {
        const link = links?.nth(i);
        if (!link) {
          return { ids: [] };
        }
        const [href, onclick, innerHTML] = await Promise.all([
          link.getAttribute('href').then((h) => h || ''),
          link.getAttribute('onclick').then((o) => o || ''),
          link.innerHTML().then((h) => h || ''),
        ]);

        const extractedIds = extractProductIdFromLink(href, onclick, innerHTML);
        return { ids: extractedIds };
      }
    );

    const linkResults = await Promise.all(linkProcessPromises);
    for (const result of linkResults) {
      ids.push(...result.ids);
    }
  }

  return {
    ids,
    usedSelector,
    linksFound,
  };
}

// ================================================
// PAGE HANDLERS
// ================================================

async function handleMainMenuPage(
  page: Page,
  crawlerInstance: PlaywrightCrawler
) {
  logger.info('Processing drink list page');

  await waitForLoad(page);
  await takeDebugScreenshot(page, 'starbucks-main-menu');

  const productIds = await extractProductIds(page);

  logger.info(
    `Selector used: ${productIds.usedSelector}, Links found: ${productIds.linksFound}`
  );
  logger.info(`Found ${productIds.ids.length} products to crawl`);

  // Limit products in test mode
  const productsToProcess = isTestMode
    ? productIds.ids.slice(0, maxProductsInTestMode)
    : productIds.ids;

  if (isTestMode) {
    logger.info(
      `🧪 Test mode: limiting to ${productsToProcess.length} products`
    );
  }

  // Prepare all product URLs
  const productRequests = productsToProcess.map((productId) => ({
    url: `${SITE_CONFIG.productUrlTemplate}${productId}`,
    userData: { productId, isProductPage: true },
  }));

  await crawlerInstance.addRequests(productRequests);
  logger.info(
    `Enqueued ${productsToProcess.length} product pages for processing`
  );
}

async function handleProductPage(
  page: Page,
  request: Request,
  crawlerInstance: PlaywrightCrawler
) {
  const productId = request.userData.productId;
  logger.info(`Processing product page: ${productId}`);

  try {
    await waitForLoad(page);
    // Wait for the main product element to ensure content is loaded
    await page.waitForSelector(SELECTORS.productDetails.name, {
      timeout: 10_000,
    });

    const product = await extractProductData(page);
    if (product.name && product.externalId) {
      const finalProduct: Product = {
        ...product,
        price: null,
        category: 'Drinks',
      };

      await crawlerInstance.pushData(finalProduct);

      logger.info(
        `✅ Extracted: ${finalProduct.name} (${finalProduct.nameEn}) - ID: ${finalProduct.externalId}`
      );
    } else {
      logger.warn(
        `⚠️ Failed to extract complete product data for ID: ${productId}`
      );
    }
  } catch (error) {
    logger.error(`❌ Error processing product ${productId}: ${error}`);
  }
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const createStarbucksCrawler = () =>
  new PlaywrightCrawler({
    launchContext: {
      launchOptions: CRAWLER_CONFIG.launchOptions,
    },
    async requestHandler({ page, request, crawler: crawlerInstance }) {
      const url = request.url;

      if (url.includes('drink_list.do')) {
        await handleMainMenuPage(page, crawlerInstance);
      } else if (request.userData?.isProductPage) {
        await handleProductPage(page, request, crawlerInstance);
      }
    },
    maxConcurrency: CRAWLER_CONFIG.maxConcurrency,
    maxRequestsPerCrawl: CRAWLER_CONFIG.maxRequestsPerCrawl,
    maxRequestRetries: CRAWLER_CONFIG.maxRequestRetries,
    requestHandlerTimeoutSecs: CRAWLER_CONFIG.requestHandlerTimeoutSecs,
  });

export const runStarbucksCrawler = async () => {
  const crawler = createStarbucksCrawler();

  try {
    await crawler.run([SITE_CONFIG.startUrl]);
    const dataset = await crawler.getData();
    await writeProductsToJson(dataset.items as Product[], 'starbucks');
  } catch (error) {
    logger.error('Starbucks crawler failed:', error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runStarbucksCrawler().catch((error) => {
    logger.error('Crawler execution failed:', error);
    process.exit(1);
  });
}
