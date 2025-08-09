import { PlaywrightCrawler, type Request } from 'crawlee';
import type { Page } from 'playwright';
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
  baseUrl: 'https://m.hollys.co.kr',
  startUrl: 'https://m.hollys.co.kr/menu/menuList.do',
  productUrlTemplate: 'https://m.hollys.co.kr',
} as const;

// ================================================
// CSS SELECTORS & REGEX PATTERNS
// ================================================

// Regex patterns for performance optimization
const PRICE_REGEX = /[\d,]+/;
const NAME_SEPARATOR_REGEX = /\s*\n\s*\t*\s*/;

const SELECTORS = {
  // Category navigation selectors
  categoryLinks: '.sec_menu > ul > li > a',

  // Product listing selectors
  productContainers: '.menu_list li',
  productLinks: '.menu_list li a',

  // Product detail page selectors (based on actual HTML structure)
  detailName: 'h3',
  detailImage: 'p.img img',
  detailDescription: '.menuList .description, .menuList p:not(.img)',
  detailPrice: '.price, .menuPrice',

  // Listing page selectors (fallback)
  productName: '.menu_name',
  productImage: '.menu_img img',
  productDescription: '.menu_desc',
  productPrice: '.menu_price',
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
  maxConcurrency: isTestMode ? 2 : 3, // Enable parallel processing
  maxRequestsPerCrawl: isTestMode ? maxRequestsInTestMode : 250, // Increased to handle all ~193 products
  maxRequestRetries: 3,
  requestHandlerTimeoutSecs: isTestMode ? 60 : 180, // Reduced timeout since we're parallel
  launchOptions: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] as string[],
  },
};

// ================================================
// PREDEFINED CATEGORIES
// ================================================

const HOLLYS_CATEGORIES = [
  'COFFEE',
  '라떼 · 초콜릿 · 티',
  '할리치노 · 빙수',
  '스무디 · 주스',
  '스파클링',
  '푸드',
  'MD상품',
  'MD식품',
] as const;

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

function parseProductName(rawName: string): {
  name: string;
  nameEn: string | null;
} {
  if (!rawName) {
    return { name: '', nameEn: null };
  }

  // Clean the raw name by removing extra whitespace
  const cleaned = rawName.trim();

  // Split by the pattern: whitespace + newline + tabs/spaces
  const parts = cleaned.split(NAME_SEPARATOR_REGEX);

  if (parts.length >= 2) {
    // First part is Korean name, second part is English name
    const koreanName = parts[0].trim();
    const englishName = parts[1].trim();

    // Validate that we have meaningful content in both parts
    if (koreanName && englishName) {
      return {
        name: koreanName,
        nameEn: englishName,
      };
    }
  }

  // If parsing fails, return the cleaned name as Korean name
  return {
    name: cleaned,
    nameEn: null,
  };
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

      if (text?.trim() && href && href.startsWith('/menu')) {
        const categoryName = text.trim();

        // Construct full URL for menu links
        const fullUrl = `${SITE_CONFIG.baseUrl}${href}`;

        // Include only categories with /menu links
        categories.push({
          name: categoryName,
          url: fullUrl,
        });
        logger.info(`📋 Found menu category: ${categoryName} -> ${fullUrl}`);
      } else if (text?.trim() && href) {
        logger.debug(`📋 Skipping non-menu link: ${text.trim()} -> ${href}`);
      }
    }

    return categories;
  } catch (error) {
    logger.error(`❌ Failed to extract categories: ${error}`);
    return [];
  }
}

async function extractProductUrls(
  page: Page,
  categoryName: string,
  crawlerInstance: PlaywrightCrawler
): Promise<number> {
  try {
    logger.info(`📄 Extracting product URLs from category: ${categoryName}`);

    await waitForLoad(page);

    // Find product links and extract URLs
    const productLinks = await page.locator(SELECTORS.productLinks).all();

    if (productLinks.length === 0) {
      logger.warn(`⚠️ No product links found for category: ${categoryName}`);
      return 0;
    }

    logger.info(
      `🔍 Found ${productLinks.length} product links in ${categoryName}`
    );

    // Extract all URLs first
    const productUrls: string[] = [];
    for (const link of productLinks) {
      try {
        const href = await link.getAttribute('href');
        if (href) {
          const productUrl = href.startsWith('http')
            ? href
            : `${SITE_CONFIG.baseUrl}${href}`;
          productUrls.push(productUrl);
        }
      } catch (error) {
        logger.debug(`⚠️ Failed to extract href from product link: ${error}`);
      }
    }

    // Limit products in test mode
    const urlsToProcess = isTestMode
      ? productUrls.slice(0, maxProductsInTestMode)
      : productUrls;

    if (isTestMode) {
      logger.info(`🧪 Test mode: limiting to ${urlsToProcess.length} products`);
    }

    // Prepare product requests for parallel processing
    const productRequests = urlsToProcess.map((productUrl) => ({
      url: productUrl,
      userData: {
        isProductPage: true,
        categoryName,
        productUrl,
      },
    }));

    // Add all product requests to the crawler queue for parallel processing
    await crawlerInstance.addRequests(productRequests);

    logger.info(
      `🚀 Enqueued ${productRequests.length} products from ${categoryName} for parallel processing`
    );

    return productRequests.length;
  } catch (extractionError) {
    logger.error(
      `❌ Failed to extract product URLs from ${categoryName}: ${extractionError}`
    );
    return 0;
  }
}

async function extractProductDetails(
  page: Page,
  productUrl: string
): Promise<{
  name: string;
  nameEn: string | null;
  imageUrl: string;
  description: string | null;
  price: string | null;
} | null> {
  try {
    // Wait for essential content first with shorter timeout
    await page.waitForSelector(SELECTORS.detailName, { timeout: 2000 });

    // Extract data using specific selectors with very short timeouts
    const [rawName, imageUrl, description, price] = await Promise.all([
      page
        .locator(SELECTORS.detailName)
        .first()
        .textContent({ timeout: 1000 })
        .then((text) => text || '')
        .catch(() => ''),

      page
        .locator(SELECTORS.detailImage)
        .first()
        .getAttribute('src', { timeout: 1000 })
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

      page
        .locator(SELECTORS.detailDescription)
        .first()
        .textContent({ timeout: 1000 })
        .then((text) => text?.trim() || null)
        .catch(() => null),

      page
        .locator(SELECTORS.detailPrice)
        .first()
        .textContent({ timeout: 1000 })
        .then((text) => text?.trim() || null)
        .catch(() => null),
    ]);

    // Parse the name to separate Korean and English parts
    const { name, nameEn } = parseProductName(rawName);

    if (name) {
      return { name, nameEn, imageUrl, description, price };
    }

    logger.debug(`⚠️ No product name found on ${productUrl}`);
    return null;
  } catch (error) {
    logger.debug(
      `⚠️ Failed to extract product details from ${productUrl}: ${error}`
    );
    return null;
  }
}

async function handleProductPage(
  page: Page,
  request: Request,
  crawlerInstance: PlaywrightCrawler
) {
  const { categoryName, productUrl } = request.userData;
  const startTime = Date.now();

  logger.info(`🔗 Processing product: ${productUrl}`);

  try {
    await waitForLoad(page);

    // Extract product details from detail page
    const extractStart = Date.now();
    const productData = await extractProductDetails(page, productUrl);
    const extractEnd = Date.now();

    if (productData) {
      // Create and push product to dataset
      const product = createBasicProduct(productData, categoryName, productUrl);
      await crawlerInstance.pushData(product);

      const totalTime = Date.now() - startTime;
      logger.info(
        `✅ Extracted: ${productData.name}${productData.nameEn ? ` | ${productData.nameEn}` : ''}${productData.price ? ` (${productData.price})` : ''} [${totalTime}ms, extraction: ${extractEnd - extractStart}ms]`
      );
    } else {
      logger.warn(`⚠️ Failed to extract data from: ${productUrl}`);
    }
  } catch (productError) {
    logger.error(`❌ Failed to process product ${productUrl}: ${productError}`);
  }
}

function createBasicProduct(
  productInfo: {
    name: string;
    nameEn: string | null;
    imageUrl: string;
    description: string | null;
    price: string | null;
  },
  categoryName: string,
  pageUrl: string
): Product {
  const externalId = `hollys_${categoryName}_${productInfo.name}`;

  // Parse price if available
  let price: number | null = null;
  if (productInfo.price) {
    const priceMatch = productInfo.price.match(PRICE_REGEX);
    if (priceMatch) {
      price = Number.parseInt(priceMatch[0].replace(/,/g, ''), 10);
    }
  }

  return {
    name: productInfo.name,
    nameEn: productInfo.nameEn,
    description: productInfo.description,
    price,
    externalImageUrl: productInfo.imageUrl,
    category: null, // Category will be set later
    externalCategory: categoryName,
    externalId,
    externalUrl: pageUrl,
  };
}

// ================================================
// PAGE HANDLERS
// ================================================

async function processDiscoveredCategory(
  page: Page,
  category: { name: string; url: string },
  index: number,
  total: number,
  crawlerInstance: PlaywrightCrawler
): Promise<void> {
  logger.info(
    `🔖 Processing category ${index + 1}/${total}: ${category.name} -> ${category.url}`
  );

  logger.info(`🌐 Navigating to: ${category.url}`);
  await page.goto(category.url, {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  });
  await waitForLoad(page);
  logger.info(`✅ Successfully loaded category page: ${category.name}`);

  logger.info(`🔍 Starting product URL extraction for: ${category.name}`);
  const productCount = await extractProductUrls(
    page,
    category.name,
    crawlerInstance
  );
  logger.info(
    `🚀 Enqueued ${productCount} products from ${category.name} for parallel processing`
  );

  logger.info(`✅ Completed category ${index + 1}/${total}: ${category.name}`);
}

async function addDelayBetweenCategories(
  index: number,
  total: number,
  nextCategoryName?: string
): Promise<void> {
  if (index < total - 1 && nextCategoryName) {
    logger.info(
      `⏳ Waiting 3 seconds before processing next category (${nextCategoryName})...`
    );
    await new Promise((resolve) => setTimeout(resolve, 3000));
    logger.info(`🔄 Starting next category: ${nextCategoryName}`);
  } else if (index === total - 1) {
    logger.info('🎉 All categories completed!');
  }
}

async function processDiscoveredCategories(
  page: Page,
  categories: { name: string; url: string }[],
  crawlerInstance: PlaywrightCrawler
): Promise<void> {
  const categoriesToProcess = isTestMode ? categories.slice(0, 1) : categories;

  if (isTestMode) {
    logger.info(
      `🧪 Test mode: limiting to ${categoriesToProcess.length} categories`
    );
  }

  for (let i = 0; i < categoriesToProcess.length; i++) {
    const category = categoriesToProcess[i];
    try {
      await processDiscoveredCategory(
        page,
        category,
        i,
        categoriesToProcess.length,
        crawlerInstance
      );

      await addDelayBetweenCategories(
        i,
        categoriesToProcess.length,
        categoriesToProcess[i + 1]?.name
      );
    } catch (categoryError) {
      logger.error(
        `❌ Failed to process category ${category.name}: ${categoryError}`
      );
      logger.info('🔄 Continuing with next category...');
    }
  }
}

async function processPredefinedCategories(
  page: Page,
  crawlerInstance: PlaywrightCrawler
): Promise<void> {
  logger.info(
    '🔖 No categories found from navigation, using predefined categories'
  );

  const categoriesToProcess = isTestMode
    ? HOLLYS_CATEGORIES.slice(0, 1)
    : HOLLYS_CATEGORIES;

  for (const categoryName of categoriesToProcess) {
    try {
      logger.info(`🔖 Processing predefined category: ${categoryName}`);

      const productCount = await extractProductUrls(
        page,
        categoryName,
        crawlerInstance
      );
      logger.info(`🚀 Enqueued ${productCount} products from ${categoryName}`);
    } catch (categoryError) {
      logger.error(
        `❌ Failed to process predefined category ${categoryName}: ${categoryError}`
      );
    }
  }
}

async function handleMainMenuPage(
  page: Page,
  crawlerInstance: PlaywrightCrawler
) {
  logger.info('Processing Hollys menu page');

  await waitForLoad(page);
  await takeDebugScreenshot(page, 'hollys-main-menu');

  const categories = await extractCategoriesFromMenu(page);

  if (categories.length > 0) {
    await processDiscoveredCategories(page, categories, crawlerInstance);
  } else {
    await processPredefinedCategories(page, crawlerInstance);
  }
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const createHollysCrawler = () =>
  new PlaywrightCrawler({
    launchContext: {
      launchOptions: CRAWLER_CONFIG.launchOptions,
    },
    async requestHandler({ page, request, crawler: crawlerInstance }) {
      const url = request.url;

      // Route requests based on URL pattern and userData
      if (url.includes('menuList.do') && !request.userData?.isProductPage) {
        // This is a category page
        await handleMainMenuPage(page, crawlerInstance);
      } else if (
        url.includes('menuView.do') ||
        request.userData?.isProductPage
      ) {
        // This is a product detail page
        await handleProductPage(page, request, crawlerInstance);
      } else {
        logger.warn(`⚠️ Unknown page type: ${url}`);
      }
    },
    maxConcurrency: CRAWLER_CONFIG.maxConcurrency,
    maxRequestsPerCrawl: CRAWLER_CONFIG.maxRequestsPerCrawl,
    maxRequestRetries: CRAWLER_CONFIG.maxRequestRetries,
    requestHandlerTimeoutSecs: CRAWLER_CONFIG.requestHandlerTimeoutSecs,
  });

export const runHollysCrawler = async () => {
  const crawler = createHollysCrawler();

  try {
    await crawler.run([SITE_CONFIG.startUrl]);
    const dataset = await crawler.getData();
    await writeProductsToJson(dataset.items as Product[], 'hollys');
  } catch (error) {
    logger.error('Hollys crawler failed:', error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runHollysCrawler().catch((error) => {
    logger.error('Crawler execution failed:', error);
    process.exit(1);
  });
}
