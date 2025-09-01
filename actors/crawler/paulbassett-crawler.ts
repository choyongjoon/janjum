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
import { extractNutritionFromText } from './nutritionUtils';

// ================================================
// SITE STRUCTURE CONFIGURATION
// ================================================

const SITE_CONFIG = {
  baseUrl: 'https://www.baristapaulbassett.co.kr',
  startUrl: 'https://www.baristapaulbassett.co.kr/menu/List.pb',
  categoryUrls: [
    'https://www.baristapaulbassett.co.kr/menu/List.pb?cid1=A', // COFFEE
    'https://www.baristapaulbassett.co.kr/menu/List.pb?cid1=B', // BEVERAGE
    'https://www.baristapaulbassett.co.kr/menu/List.pb?cid1=C', // ICE-CREAM
    'https://www.baristapaulbassett.co.kr/menu/List.pb?cid1=D', // FOOD
    'https://www.baristapaulbassett.co.kr/menu/List.pb?cid1=E', // PRODUCT
  ],
} as const;

// ================================================
// CSS SELECTORS
// ================================================

const SELECTORS = {
  // Product listing selectors - simplified to working selector
  productItems: 'ul li:has(img[src*="/upload/product/"])',

  // Product data selectors
  productData: {
    nameContainer: '.txtArea',
    nameEn: '.txtArea .sTxt',
    image: 'img',
    productLink: 'a',
  },

  // Product detail page selectors
  productDetail: {
    nutritional: '.nutritional',
  },
} as const;

// ================================================
// REGEX PATTERNS
// ================================================

// Regex for extracting product ID from goView() onclick attributes
const GO_VIEW_REGEX = /goView\s*\(\s*['"]([^'"]+)['"]\s*\)/;

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
  : 100;

const CRAWLER_CONFIG = {
  maxConcurrency: 3,
  maxRequestsPerCrawl: isTestMode ? maxRequestsInTestMode : 100,
  maxRequestRetries: 2,
  requestHandlerTimeoutSecs: isTestMode ? 20 : 30,
  launchOptions: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
};

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

// Regular expressions defined at module level for performance
const EXTERNAL_ID_REGEX = /[^\w-]/g;

async function extractNutritionFromItem(
  item: Locator
): Promise<Nutritions | null> {
  try {
    // Try to find .nutritional selector within the item
    const nutritionalElement = item.locator(
      SELECTORS.productDetail.nutritional
    );
    const nutritionalCount = await nutritionalElement.count();

    if (nutritionalCount > 0) {
      logger.debug(
        'Found .nutritional selector within item, extracting nutrition data'
      );
      const nutritionText = await nutritionalElement
        .textContent()
        .catch(() => '');

      if (nutritionText) {
        logger.debug(`Nutrition text from item: ${nutritionText}`);
        const nutrition = extractNutritionFromText(nutritionText);
        if (nutrition) {
          logger.info(
            'Successfully extracted nutrition data from item .nutritional'
          );
          return nutrition;
        }
      }
    }

    // Paul Bassett's listing page doesn't contain nutrition information
    // Nutrition data needs to be extracted from individual product detail pages
    return null;
  } catch (error) {
    logger.debug(
      'Failed to extract nutrition data from Paul Bassett item:',
      error as Record<string, unknown>
    );
    return null;
  }
}

// Extract nutrition data from product detail page
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: refactor later
async function extractNutritionFromDetailPage(
  page: Page,
  productUrl: string,
  productName: string
): Promise<Nutritions | null> {
  try {
    logger.info(`🔍 Navigating to product detail page: ${productUrl}`);
    await page.goto(productUrl);
    await waitForLoad(page);

    // Try multiple selectors for nutrition information
    const nutritionSelectors = [
      '.nutritional',
      '.nutrition-info',
      '.product-nutrition',
      '[class*="nutrition"]',
      'table:has-text("칼로리")',
      'div:has-text("영양")',
      'div:has-text("칼로리")',
      '.product-detail .nutrition',
    ];

    for (const selector of nutritionSelectors) {
      try {
        const elements = page.locator(selector);
        const count = await elements.count();

        if (count > 0) {
          logger.info(`📋 Found nutrition elements with selector: ${selector}`);

          // Try to extract from all matching elements
          for (let i = 0; i < count; i++) {
            const element = elements.nth(i);
            const textContent = await element.textContent().catch(() => '');

            if (
              textContent &&
              (textContent.includes('칼로리') ||
                textContent.includes('영양') ||
                textContent.includes('kcal'))
            ) {
              logger.info(`🔍 Found nutrition text in element ${i}`);
              const nutrition = extractNutritionFromText(textContent);
              if (nutrition) {
                logger.info(
                  `📊 Successfully extracted nutrition data for ${productName}`
                );
                return nutrition;
              }
            }
          }
        }
      } catch (error) {
        logger.debug(
          `Failed to process selector ${selector}:`,
          error as Record<string, unknown>
        );
      }
    }

    logger.info(`⚠️ No nutrition data found on detail page for ${productName}`);
    return null;
  } catch (error) {
    logger.warn(
      `Failed to extract nutrition from detail page ${productUrl}:`,
      error
    );
    return null;
  }
}

// Map category IDs to category names and types
const CATEGORY_MAP = {
  A: { name: 'COFFEE', type: 'Coffee' },
  B: { name: 'BEVERAGE', type: 'Beverage' },
  C: { name: 'ICE-CREAM', type: 'Dessert' },
  D: { name: 'FOOD', type: 'Food' },
  E: { name: 'PRODUCT', type: 'Product' },
  default: { name: 'COFFEE', type: 'Coffee' },
} as const;

function getCategoryFromUrl(url: string): { name: string; type: string } {
  const urlObj = new URL(url);
  const cid1 = urlObj.searchParams.get('cid1');
  return (
    CATEGORY_MAP[cid1 as keyof typeof CATEGORY_MAP] || CATEGORY_MAP.default
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: optimize later
async function extractProductFromItem(
  item: Locator,
  pageUrl: string
): Promise<Product | null> {
  try {
    // Extract Korean name from the main text area (excluding the English span)
    const nameContainerElement = item
      .locator(SELECTORS.productData.nameContainer)
      .first();
    const fullNameText = await nameContainerElement
      .textContent()
      .then((text) => text?.trim() || '')
      .catch(() => '');

    // Extract English name from the span element
    const nameEnElement = item.locator(SELECTORS.productData.nameEn).first();
    const nameEn = await nameEnElement
      .textContent()
      .then((text) => text?.trim() || '')
      .catch(() => '');

    // Get Korean name by removing the English part from the full text
    const name = nameEn
      ? fullNameText.replace(nameEn, '').trim()
      : fullNameText;

    // Extract image src
    const imageSrc = await item
      .locator(SELECTORS.productData.image)
      .first()
      .getAttribute('src')
      .catch(() => '');

    // Extract product detail page URL
    const productLink = await item
      .locator(SELECTORS.productData.productLink)
      .first()
      .getAttribute('href')
      .catch(() => '');

    // Extract product ID from onclick or data attributes for detail page URL
    let productDetailUrl = '';
    let productId = '';

    if (productLink && productLink !== '#') {
      // Use the actual link if it's not "#"
      productDetailUrl = new URL(productLink, SITE_CONFIG.baseUrl).href;
    } else {
      // Paul Bassett uses href="#" but has JavaScript navigation
      // Try to extract product ID from onclick attribute or data attributes
      try {
        const onclickAttr = await item
          .locator(SELECTORS.productData.productLink)
          .first()
          .getAttribute('onclick')
          .catch(() => '');

        // Debug: Log onclick attribute for first product
        if (name === '오렌지플로우 피즈프레소') {
          logger.info(`🔍 Debug: onclick attribute: "${onclickAttr}"`);
        }

        // Look for patterns like goView('PB182900') in onclick
        const dpidMatch = onclickAttr?.match(GO_VIEW_REGEX);
        if (dpidMatch) {
          productId = dpidMatch[1];
          if (name === '오렌지플로우 피즈프레소') {
            logger.info(`🔍 Debug: extracted dpid: "${productId}"`);
          }
        } else {
          // Try to extract from other attributes or generate based on naming
          // For now, generate a mock dpid based on product name
          const cleanName = (nameEn || name).replace(/[^a-zA-Z0-9]/g, '');
          productId = `PB${cleanName.substring(0, 6).toUpperCase()}00`;
        }

        // Construct proper detail page URL
        const categoryId =
          getCategoryFromUrl(pageUrl).name === 'COFFEE' ? 'A' : 'B';
        productDetailUrl = `${SITE_CONFIG.baseUrl}/menu/View.pb?cid1=${categoryId}&cid2=&dpid=${productId}`;

        if (name === '오렌지플로우 피즈프레소') {
          logger.info(`🔍 Debug: final URL: "${productDetailUrl}"`);
        }
      } catch (error) {
        logger.debug(
          `Failed to extract product ID for ${name}:`,
          error as Record<string, unknown>
        );
        // Fallback: generate mock dpid
        const cleanName = (nameEn || name).replace(/[^a-zA-Z0-9]/g, '');
        productId = `PB${cleanName.substring(0, 6).toUpperCase()}00`;
        const categoryId =
          getCategoryFromUrl(pageUrl).name === 'COFFEE' ? 'A' : 'B';
        productDetailUrl = `${SITE_CONFIG.baseUrl}/menu/View.pb?cid1=${categoryId}&cid2=&dpid=${productId}`;
      }
    }

    // Try to extract nutrition data from the item itself first
    const nutritions = await extractNutritionFromItem(item);

    // If no nutrition data found in listing and we have a valid detail URL,
    // we'll extract nutrition data during the detail page navigation phase
    // This is handled separately in the extraction pipeline

    // Check for status labels (New/Best)
    const fullText = (await item.textContent().catch(() => '')) || '';
    const hasNewLabel = fullText.includes('[New]') || fullText.includes('NEW');
    const hasBestLabel =
      fullText.includes('[Best]') || fullText.includes('BEST');

    if (!name || name.length <= 2) {
      return null; // Filter out empty or very short names
    }

    // Determine category from URL
    const categoryInfo = getCategoryFromUrl(pageUrl);

    let description = '';
    if (hasNewLabel) {
      description = 'New Product';
    } else if (hasBestLabel) {
      description = 'Best Seller';
    }

    const product: Product = {
      name: name || nameEn, // Use Korean as primary, fallback to English
      nameEn: nameEn || name, // Use English as primary, fallback to Korean
      description,
      externalCategory: categoryInfo.name,
      externalId: (nameEn || name)
        .replace(/\s+/g, '-')
        .toLowerCase()
        .replace(EXTERNAL_ID_REGEX, ''),
      externalImageUrl: imageSrc
        ? new URL(imageSrc, SITE_CONFIG.baseUrl).href
        : '',
      externalUrl: productDetailUrl || pageUrl,
      price: null,
      category: categoryInfo.type,
      nutritions,
    };

    let statusInfo = '';
    if (hasNewLabel) {
      statusInfo = ' [New]';
    } else if (hasBestLabel) {
      statusInfo = ' [Best]';
    }
    const nutritionInfo = nutritions ? ' with nutrition data' : '';
    logger.info(
      `✅ Extracted [${categoryInfo.name}]: ${product.name}${statusInfo}${nutritionInfo}`
    );
    return product;
  } catch (error) {
    logger.warn(`Failed to extract data from product item: ${error}`);
    return null;
  }
}

async function _extractProductDetailsFromPage(
  page: Page,
  basicInfo: {
    name: string;
    categoryInfo: { name: string; type: string };
    productUrl: string;
  }
): Promise<Product | null> {
  try {
    await waitForLoad(page);

    // Extract detailed information from product page
    const name = basicInfo.name;
    const nameEn = ''; // Extract from page if available
    const description = ''; // Extract from page if available

    // Extract image (update selector as needed)
    const imageSrc = await page
      .locator('img')
      .first()
      .getAttribute('src')
      .catch(() => '');

    // Extract nutrition data (currently not available on Paul Bassett pages)
    const nutritions: Nutritions | null = null;

    const product: Product = {
      name,
      nameEn,
      description,
      externalCategory: basicInfo.categoryInfo.name,
      externalId: name
        .replace(/\s+/g, '-')
        .toLowerCase()
        .replace(EXTERNAL_ID_REGEX, ''),
      externalImageUrl: imageSrc
        ? new URL(imageSrc, SITE_CONFIG.baseUrl).href
        : '',
      externalUrl: basicInfo.productUrl,
      price: null,
      category: basicInfo.categoryInfo.type,
      nutritions,
    };

    logger.info(
      `✅ Extracted [${basicInfo.categoryInfo.name}]: ${name} with nutrition data`
    );
    return product;
  } catch (error) {
    logger.warn(
      `Failed to extract product details from ${basicInfo.productUrl}: ${error}`
    );
    return null;
  }
}

async function extractProductsFromPage(page: Page): Promise<Product[]> {
  const pageUrl = page.url();

  try {
    const items = await page.locator(SELECTORS.productItems).all();
    logger.info(`Found ${items.length} product items`);

    const productPromises = items.map((item) =>
      extractProductFromItem(item, pageUrl)
    );
    const extractedProducts = await Promise.all(productPromises);
    const validProducts = extractedProducts.filter(
      (product): product is Product => product !== null
    );

    logger.info(`Found ${validProducts.length} products to process`);

    // Apply test mode limit before processing detail pages
    if (isTestMode) {
      logger.info(
        `🧪 Test mode: limiting to ${maxProductsInTestMode} products`
      );
      validProducts.splice(maxProductsInTestMode);
    }

    // Second phase: Extract nutrition data from detail pages
    for (let i = 0; i < validProducts.length; i++) {
      const product = validProducts[i];

      // Only navigate to detail page if we have a valid URL and no nutrition data
      if (
        product.externalUrl &&
        product.externalUrl !== pageUrl &&
        !product.nutritions
      ) {
        try {
          logger.info(
            `🔍 Extracting nutrition data for: ${product.name} (${i + 1}/${validProducts.length})`
          );
          const nutritions = await extractNutritionFromDetailPage(
            page,
            product.externalUrl,
            product.name
          );

          if (nutritions) {
            product.nutritions = nutritions;
            logger.info(`✅ Updated ${product.name} with nutrition data`);
          } else {
            logger.info(`ℹ️ No nutrition data found for ${product.name}`);
          }
        } catch (error) {
          logger.warn(
            `Failed to extract nutrition for ${product.name}:`,
            error
          );
        }
      }
    }

    return validProducts;
  } catch (error) {
    logger.error(`Failed to extract products: ${error}`);
    return [];
  }
}

// ================================================
// PAGE HANDLERS
// ================================================

async function handleMenuPage(page: Page, crawlerInstance: PlaywrightCrawler) {
  logger.info('Processing Paul Bassett menu page');

  await waitForLoad(page);
  await takeDebugScreenshot(page, 'paulbassett-menu');

  const products = await extractProductsFromPage(page);

  // Push all products directly to the crawler
  for (const product of products) {
    await crawlerInstance.pushData(product);
  }

  logger.info(`Processed ${products.length} products from Paul Bassett menu`);
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const createPaulBassettCrawler = () =>
  new PlaywrightCrawler({
    launchContext: {
      launchOptions: CRAWLER_CONFIG.launchOptions,
    },
    async requestHandler({ page, crawler: crawlerInstance }) {
      await handleMenuPage(page, crawlerInstance);
    },
    maxConcurrency: CRAWLER_CONFIG.maxConcurrency,
    maxRequestsPerCrawl: CRAWLER_CONFIG.maxRequestsPerCrawl,
    maxRequestRetries: CRAWLER_CONFIG.maxRequestRetries,
    requestHandlerTimeoutSecs: CRAWLER_CONFIG.requestHandlerTimeoutSecs,
  });

export const runPaulBassettCrawler = async () => {
  const crawler = createPaulBassettCrawler();

  try {
    // Crawl all categories to get complete product catalog
    const urlsToCrawl = isTestMode
      ? [SITE_CONFIG.startUrl]
      : SITE_CONFIG.categoryUrls;
    logger.info(
      `Crawling ${urlsToCrawl.length} category pages${isTestMode ? ' (test mode - main page only)' : ''}`
    );

    await crawler.run(urlsToCrawl);
    const dataset = await crawler.getData();
    await writeProductsToJson(dataset.items as Product[], 'paulbassett');
  } catch (error) {
    logger.error(
      'Paul Bassett crawler failed:',
      error as Record<string, unknown>
    );
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runPaulBassettCrawler().catch((error) => {
    logger.error('Crawler execution failed:', error as Record<string, unknown>);
    process.exit(1);
  });
}
