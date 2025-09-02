import { PlaywrightCrawler, type Request } from 'crawlee';
import type { Locator, Page } from 'playwright';
import { logger } from '../../shared/logger';
import type { Nutritions } from '../../shared/nutritions';
import { type Product, waitForLoad, writeProductsToJson } from './crawlerUtils';

// ================================================
// SITE STRUCTURE CONFIGURATION
// ================================================

const SITE_CONFIG = {
  baseUrl: 'https://composecoffee.com',
  startUrl: 'https://composecoffee.com/menu',
  categoryUrlTemplate: 'https://composecoffee.com/menu/category/',
} as const;

// ================================================
// CSS SELECTORS
// ================================================

const SELECTORS = {
  // Main menu page selectors
  categoryLinks: '.dropdown-menu a[href*="/menu/category/"]',

  // Category page selectors
  productContainers: '.itemBox',
  productData: {
    id: '> div[id]',
    name: 'h3.undertitle',
    image: '.rthumbnailimg',
  },

  // Pagination selectors
  pagination: 'a[href*="page="], .pagination a, .page-link',
} as const;

// ================================================
// REGEX PATTERNS
// ================================================

const PATTERNS = {
  categoryId: /\/menu\/category\/(\d+)/,
  pageNumber: /page=(\d+)/,
} as const;

// Compose-specific nutrition patterns
const COMPOSE_NUTRITION_PATTERNS = {
  servingSize: /용량\s*:\s*(\d+(?:\.\d+)?)\s*(ml|oz)/i,
  calories: /열량\s*\(\s*kcal\s*\)\s*:\s*(\d+(?:\.\d+)?)/i,
  sodium: /나트륨\s*\(\s*mg\s*\)\s*:\s*(\d+(?:\.\d+)?)/i,
  carbohydrates: /탄수화물\s*\(\s*g\s*\)\s*:\s*(\d+(?:\.\d+)?)/i,
  sugar: /당류\s*\(\s*g\s*\)\s*:\s*(\d+(?:\.\d+)?)/i,
  fat: /지방\s*\(\s*g\s*\)\s*:\s*(\d+(?:\.\d+)?)/i,
  saturatedFat: /포화지방\s*\(\s*g\s*\)\s*:\s*(\d+(?:\.\d+)?)/i,
  protein: /단백질\s*\(\s*g\s*\)\s*:\s*(\d+(?:\.\d+)?)/i,
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
  : 100;

const CRAWLER_CONFIG = {
  maxConcurrency: 3,
  maxRequestsPerCrawl: isTestMode ? maxRequestsInTestMode : 100,
  maxRequestRetries: 2,
  requestHandlerTimeoutSecs: isTestMode ? 30 : 60,
  launchOptions: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
};

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

// Helper function to extract Compose nutrition data
function extractComposeNutrition(nutritionText: string): Nutritions | null {
  try {
    const nutrition: Nutritions = {};

    // Extract serving size
    const servingSizeMatch = nutritionText.match(
      COMPOSE_NUTRITION_PATTERNS.servingSize
    );
    if (servingSizeMatch) {
      let servingSize = Number.parseFloat(servingSizeMatch[1]);
      let unit = servingSizeMatch[2].toLowerCase();

      // Convert oz to ml if needed
      if (unit === 'oz') {
        servingSize *= 29.5735; // 1 oz = 29.5735 ml
        unit = 'ml';
      }

      nutrition.servingSize = servingSize;
      nutrition.servingSizeUnit = unit;
    }

    // Extract calories
    const caloriesMatch = nutritionText.match(
      COMPOSE_NUTRITION_PATTERNS.calories
    );
    if (caloriesMatch) {
      nutrition.calories = Number.parseFloat(caloriesMatch[1]);
      nutrition.caloriesUnit = 'kcal';
    }

    // Extract sodium
    const sodiumMatch = nutritionText.match(COMPOSE_NUTRITION_PATTERNS.sodium);
    if (sodiumMatch) {
      nutrition.natrium = Number.parseFloat(sodiumMatch[1]);
      nutrition.natriumUnit = 'mg';
    }

    // Extract carbohydrates
    const carbohydratesMatch = nutritionText.match(
      COMPOSE_NUTRITION_PATTERNS.carbohydrates
    );
    if (carbohydratesMatch) {
      nutrition.carbohydrates = Number.parseFloat(carbohydratesMatch[1]);
      nutrition.carbohydratesUnit = 'g';
    }

    // Extract sugar
    const sugarMatch = nutritionText.match(COMPOSE_NUTRITION_PATTERNS.sugar);
    if (sugarMatch) {
      nutrition.sugar = Number.parseFloat(sugarMatch[1]);
      nutrition.sugarUnit = 'g';
    }

    // Extract fat
    const fatMatch = nutritionText.match(COMPOSE_NUTRITION_PATTERNS.fat);
    if (fatMatch) {
      nutrition.fat = Number.parseFloat(fatMatch[1]);
      nutrition.fatUnit = 'g';
    }

    // Extract saturated fat
    const saturatedFatMatch = nutritionText.match(
      COMPOSE_NUTRITION_PATTERNS.saturatedFat
    );
    if (saturatedFatMatch) {
      nutrition.saturatedFat = Number.parseFloat(saturatedFatMatch[1]);
      nutrition.saturatedFatUnit = 'g';
    }

    // Extract protein
    const proteinMatch = nutritionText.match(
      COMPOSE_NUTRITION_PATTERNS.protein
    );
    if (proteinMatch) {
      nutrition.protein = Number.parseFloat(proteinMatch[1]);
      nutrition.proteinUnit = 'g';
    }

    // Return nutrition data if we found any values
    return Object.keys(nutrition).length > 0 ? nutrition : null;
  } catch (error) {
    logger.debug(`Error extracting Compose nutrition: ${error}`);
    return null;
  }
}

async function extractProductData(container: Locator) {
  try {
    const [productId, name, imageUrl, nutritionInfo] = await Promise.all([
      container
        .locator(SELECTORS.productData.id)
        .getAttribute('id')
        .then((id) => id || ''),
      container
        .locator(SELECTORS.productData.name)
        .textContent()
        .then((text) => text?.trim() || ''),
      container
        .locator(SELECTORS.productData.image)
        .getAttribute('src')
        .then((src) => {
          let url = src || '';
          if (url.startsWith('/')) {
            url = `${SITE_CONFIG.baseUrl}${url}`;
          }
          return url;
        }),
      container
        .locator('ul.info.g-0')
        .textContent()
        .then((text) => text?.trim() || '')
        .catch(() => ''),
    ]);

    if (name && name.length > 0) {
      // Extract nutrition data using the custom Compose parser
      let nutritions: Nutritions | null = null;
      if (nutritionInfo) {
        nutritions = extractComposeNutrition(nutritionInfo);
        if (nutritions) {
          logger.info(`✅ Found nutrition data for: ${name}`);
        }
      }

      return {
        name,
        nameEn: null,
        description: null,
        price: null,
        imageUrl,
        id: productId,
        nutritions,
      };
    }
  } catch {
    // Skip products that fail to extract
  }
  return null;
}

async function extractPageProducts(page: Page) {
  const products: Array<{
    name: string;
    nameEn: string | null;
    description: string | null;
    price: number | null;
    imageUrl: string;
    id: string;
    nutritions?: Nutritions | null;
  }> = [];

  // Get all product containers
  const productContainers = page.locator(SELECTORS.productContainers);
  const containerCount = await productContainers.count();

  // Process all containers in parallel
  const productPromises = Array.from({ length: containerCount }, async (_, i) =>
    extractProductData(productContainers.nth(i))
  );

  const productResults = await Promise.all(productPromises);
  products.push(...productResults.filter((p) => p !== null));

  // Check for pagination
  const paginationElements = page.locator(SELECTORS.pagination);
  const paginationCount = await paginationElements.count();
  let maxPage = 1;

  if (paginationCount > 0) {
    const hrefPromises = Array.from({ length: paginationCount }, (_, i) =>
      paginationElements.nth(i).getAttribute('href')
    );
    const hrefs = await Promise.all(hrefPromises);

    for (const href of hrefs) {
      const match = href?.match(PATTERNS.pageNumber);
      if (match) {
        const pageNum = Number.parseInt(match[1], 10);
        if (pageNum > maxPage) {
          maxPage = pageNum;
        }
      }
    }
  }

  // Get current page from URL
  const url = page.url();
  const urlParams = new URLSearchParams(new URL(url).search);
  const currentPage = urlParams.get('page') || '1';

  return {
    products,
    maxPage,
    currentPage,
    pageUrl: url,
  };
}

async function extractCategoryData(page: Page) {
  const categoryLinks = page.locator(SELECTORS.categoryLinks);
  const linkCount = await categoryLinks.count();
  const categories: Array<{ url: string; name: string; id: string }> = [];

  if (linkCount > 0) {
    const linkPromises = Array.from({ length: linkCount }, async (_, i) => {
      const link = categoryLinks.nth(i);
      const [href, text] = await Promise.all([
        link.getAttribute('href'),
        link.textContent().then((t) => t?.trim() || ''),
      ]);

      if (href && text) {
        const match = href.match(PATTERNS.categoryId);
        if (match) {
          return {
            url: href.startsWith('/') ? `${SITE_CONFIG.baseUrl}${href}` : href,
            name: text,
            id: match[1],
          };
        }
      }
      return null;
    });

    const linkResults = await Promise.all(linkPromises);
    categories.push(...linkResults.filter((c) => c !== null));
  }

  return {
    categories,
    pageTitle: await page.title(),
    pageUrl: page.url(),
  };
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
  // Debug screenshot removed for performance
  // await takeDebugScreenshot(page, 'compose-main-menu');

  const categoryData = await extractCategoryData(page);

  logger.info(`Found ${categoryData.categories.length} categories`);

  // Enqueue all category pages
  const categoryRequests = categoryData.categories.map((category) => ({
    url: category.url,
    userData: {
      categoryId: category.id,
      categoryName: category.name,
      isCategoryPage: true,
      page: 1,
    },
  }));
  await crawlerInstance.addRequests(categoryRequests);

  logger.info(
    `Enqueued ${categoryData.categories.length} category pages for processing`
  );
}

async function handleCategoryPage(
  page: Page,
  request: Request,
  crawlerInstance: PlaywrightCrawler
) {
  const categoryId = request.userData.categoryId;
  const categoryName = request.userData.categoryName;
  const currentPage = request.userData.page || 1;
  const url = request.url;

  logger.info(
    `Processing category: ${categoryName} (ID: ${categoryId}, Page: ${currentPage})`
  );

  // Take a screenshot for debugging (only for first category)
  if (categoryId === '207002' && currentPage === 1) {
    // Debug screenshot removed for performance
    // await takeDebugScreenshot(page, `compose-category-${categoryId}`);
  }

  try {
    await waitForLoad(page);

    const pageData = await extractPageProducts(page);

    logger.info(
      `Found ${pageData.products.length} products on page ${currentPage}`
    );

    // Save products from this page
    let products = pageData.products.map((productData) => ({
      name: productData.name,
      nameEn: productData.nameEn,
      description: productData.description,
      price: productData.price,
      externalImageUrl: productData.imageUrl,
      category: 'Drinks' as const,
      externalCategory: categoryName,
      externalId: `compose_${categoryId}_${productData.name}`,
      externalUrl: url,
      nutritions: productData.nutritions || null,
    }));

    // Limit products in test mode
    if (isTestMode) {
      products = products.slice(0, maxProductsInTestMode);
      logger.info(`🧪 Test mode: limiting to ${products.length} products`);
    }

    await Promise.all(
      products.map(async (product) => {
        await crawlerInstance.pushData(product);
        logger.info(
          `✅ Extracted: ${product.name} - Category: ${categoryName}`
        );
      })
    );

    // Handle pagination - enqueue next pages (skip in test mode)
    if (currentPage === 1 && pageData.maxPage > 1 && !isTestMode) {
      const paginationRequests: Array<{
        url: string;
        userData: {
          categoryId: string;
          categoryName: string;
          isCategoryPage: boolean;
          page: number;
        };
      }> = [];
      for (let pageNum = 2; pageNum <= pageData.maxPage; pageNum++) {
        const nextPageUrl = `${url.split('?')[0]}?page=${pageNum}`;
        paginationRequests.push({
          url: nextPageUrl,
          userData: {
            categoryId,
            categoryName,
            isCategoryPage: true,
            page: pageNum,
          },
        });
      }
      await crawlerInstance.addRequests(paginationRequests);
      logger.info(
        `Enqueued pages 2-${pageData.maxPage} for category: ${categoryName}`
      );
    }
  } catch (error) {
    logger.error(`❌ Error processing category ${categoryName}: ${error}`);
  }
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const createComposeCrawler = () =>
  new PlaywrightCrawler({
    launchContext: {
      launchOptions: CRAWLER_CONFIG.launchOptions,
    },
    async requestHandler({ page, request, crawler: crawlerInstance }) {
      const url = request.url;

      // Handle main menu page - discover categories
      if (url.includes('/menu') && !url.includes('category')) {
        await handleMainMenuPage(page, crawlerInstance);
        return;
      }

      // Handle category pages - extract products and pagination
      if (request.userData?.isCategoryPage) {
        await handleCategoryPage(page, request, crawlerInstance);
      }
    },
    maxConcurrency: CRAWLER_CONFIG.maxConcurrency,
    maxRequestsPerCrawl: CRAWLER_CONFIG.maxRequestsPerCrawl,
    maxRequestRetries: CRAWLER_CONFIG.maxRequestRetries,
    requestHandlerTimeoutSecs: CRAWLER_CONFIG.requestHandlerTimeoutSecs,
  });

export const runComposeCrawler = async () => {
  const crawler = createComposeCrawler();

  try {
    await crawler.run([SITE_CONFIG.startUrl]);
    const dataset = await crawler.getData();
    await writeProductsToJson(dataset.items as Product[], 'compose');
  } catch (error) {
    logger.error('Compose crawler failed:', error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runComposeCrawler().catch((error) => {
    logger.error('Crawler execution failed:', error);
    process.exit(1);
  });
}
