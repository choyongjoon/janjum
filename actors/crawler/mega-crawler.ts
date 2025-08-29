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
  baseUrl: 'https://www.mega-mgccoffee.com',
  startUrl: 'https://www.mega-mgccoffee.com/menu/',
  categoryUrlTemplate: 'https://www.mega-mgccoffee.com/menu/?menu_category1=',
} as const;

// ================================================
// REGEX PATTERNS
// ================================================

const REGEX_PATTERNS = {
  numberWithCommas: /[\d,]+/,
  servingSize: /(\d+)\s*(ml|mL|ML)/i,
  calories: /(\d+)\s*(kcal|칼로리|열량)/i,
  protein: /(단백질|protein)[:\s]*(\d+\.?\d*)\s*g/i,
  fat: /(지방|fat)[:\s]*(\d+\.?\d*)\s*g/i,
  carbohydrates: /(탄수화물|carbs)[:\s]*(\d+\.?\d*)\s*g/i,
  sugar: /(당류|sugar)[:\s]*(\d+\.?\d*)\s*g/i,
  sodium: /(나트륨|sodium)[:\s]*(\d+\.?\d*)\s*mg/i,
  caffeine: /(카페인|caffeine)[:\s]*(\d+\.?\d*)\s*mg/i,
} as const;

// ================================================
// CSS SELECTORS
// ================================================

const SELECTORS = {
  // Product container selectors (multiple strategies)
  productContainers: [
    '.cont_gallery_list .inner_modal_open',
    '.cont_gallery_list ul li',
    '.product-item',
    '.menu-item',
    '.item-box',
    'li[data-id]',
    '.gallery-item',
  ],

  // Product data selectors
  productData: {
    name: '.cont_text_title',
    nameEn: '.cont_text_info div.text1',
    description: '.cont_text_info div.text2',
    image: 'img',
  },

  // Category discovery selectors
  categoryCheckboxes: [
    'input[name="list_checkbox"]',
    '.category-filter input',
    '.menu-category input',
    'input[type="checkbox"][data-category]',
  ],

  // Pagination selectors
  pagination: {
    nextButton: '.board_page_next',
    loadMoreButton:
      'button:has-text("더보기"), .load-more, button:has-text("Load More")',
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
  : 10;

const CRAWLER_CONFIG = {
  maxConcurrency: 1, // Single concurrency for pagination
  maxRequestsPerCrawl: isTestMode ? maxRequestsInTestMode : 10,
  maxRequestRetries: 2,
  requestHandlerTimeoutSecs: isTestMode ? 60 : 300, // 1 minute for test, 5 minutes for pagination
  maxPages: isTestMode ? 1 : 50, // Single page in test mode
  launchOptions: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
};

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

// Helper function to parse nutrition values for Mega
function _parseMegaNutritionValue(text: string): number | null {
  if (!text || text.trim() === '' || text.trim() === '-') {
    return null;
  }
  const match = text.match(REGEX_PATTERNS.numberWithCommas);
  if (match) {
    const value = Number.parseFloat(match[0].replace(/,/g, ''));
    return Number.isNaN(value) ? null : value;
  }
  return null;
}

// Helper function to extract body text and log sample
async function getPageBodyText(page: Page): Promise<string | null> {
  const bodyText = await page.locator('body').innerText();
  if (!bodyText) {
    logger.info('No content found on page for nutrition extraction');
    return null;
  }

  // Log a sample of the page text for debugging
  const sampleText = bodyText.substring(0, 2000);
  logger.info(
    `Sample page text: ${sampleText.replace(/\n/g, ' ').replace(/\s+/g, ' ')}`
  );

  return bodyText;
}

// Helper function to find all nutrition matches
function findMegaNutritionMatches(bodyText: string) {
  return {
    servingSizeMatch: bodyText.match(REGEX_PATTERNS.servingSize),
    caloriesMatch: bodyText.match(REGEX_PATTERNS.calories),
    proteinMatch: bodyText.match(REGEX_PATTERNS.protein),
    fatMatch: bodyText.match(REGEX_PATTERNS.fat),
    carbohydratesMatch: bodyText.match(REGEX_PATTERNS.carbohydrates),
    sugarMatch: bodyText.match(REGEX_PATTERNS.sugar),
    natriumMatch: bodyText.match(REGEX_PATTERNS.sodium),
    caffeineMatch: bodyText.match(REGEX_PATTERNS.caffeine),
  };
}

// Helper function to check if any nutrition data exists
function hasAnyMegaNutritionData(
  matches: Record<string, RegExpMatchArray | null>
): boolean {
  return Object.values(matches).some((match) => match !== null);
}

// Helper function to log nutrition matches
function logMegaNutritionMatches(
  matches: Record<string, RegExpMatchArray | null>
): void {
  const matchStatus = Object.entries(matches)
    .map(([key, match]) => `${key}=${!!match}`)
    .join(', ');
  logger.info(`Nutrition matches found: ${matchStatus}`);
}

// Helper function to extract basic nutrition values
function extractMegaBasicNutrition(
  matches: Record<string, RegExpMatchArray | null>
) {
  return {
    servingSize: matches.servingSizeMatch
      ? Number.parseInt(matches.servingSizeMatch[1], 10)
      : null,
    servingSizeUnit: matches.servingSizeMatch ? 'ml' : null,
    calories: matches.caloriesMatch
      ? Number.parseInt(matches.caloriesMatch[1], 10)
      : null,
    caloriesUnit: matches.caloriesMatch ? 'kcal' : null,
  };
}

// Helper function to extract macro nutrition values
function extractMegaMacroNutrition(
  matches: Record<string, RegExpMatchArray | null>
) {
  return {
    protein: matches.proteinMatch
      ? Number.parseFloat(matches.proteinMatch[2])
      : null,
    proteinUnit: matches.proteinMatch ? 'g' : null,
    fat: matches.fatMatch ? Number.parseFloat(matches.fatMatch[2]) : null,
    fatUnit: matches.fatMatch ? 'g' : null,
    carbohydrates: matches.carbohydratesMatch
      ? Number.parseFloat(matches.carbohydratesMatch[2])
      : null,
    carbohydratesUnit: matches.carbohydratesMatch ? 'g' : null,
    sugar: matches.sugarMatch ? Number.parseFloat(matches.sugarMatch[2]) : null,
    sugarUnit: matches.sugarMatch ? 'g' : null,
  };
}

// Helper function to extract mineral and other nutrition values
function extractMegaMineralNutrition(
  matches: Record<string, RegExpMatchArray | null>
) {
  return {
    natrium: matches.natriumMatch
      ? Number.parseFloat(matches.natriumMatch[2])
      : null,
    natriumUnit: matches.natriumMatch ? 'mg' : null,
    caffeine: matches.caffeineMatch
      ? Number.parseFloat(matches.caffeineMatch[2])
      : null,
    caffeineUnit: matches.caffeineMatch ? 'mg' : null,
  };
}

// Helper function to create Mega nutrition object
function createMegaNutritionObject(
  matches: Record<string, RegExpMatchArray | null>
): Nutritions {
  const basicNutrition = extractMegaBasicNutrition(matches);
  const macroNutrition = extractMegaMacroNutrition(matches);
  const mineralNutrition = extractMegaMineralNutrition(matches);

  return {
    ...basicNutrition,
    ...macroNutrition,
    ...mineralNutrition,
    transFat: null,
    transFatUnit: null,
    saturatedFat: null,
    saturatedFatUnit: null,
    cholesterol: null,
    cholesterolUnit: null,
  };
}

async function extractNutritionData(page: Page): Promise<Nutritions | null> {
  try {
    logger.info('Starting nutrition data extraction');
    // Wait for any dynamic content to load
    await page.waitForTimeout(2000);

    const bodyText = await getPageBodyText(page);
    if (!bodyText) {
      return null;
    }

    const matches = findMegaNutritionMatches(bodyText);
    logMegaNutritionMatches(matches);

    if (!hasAnyMegaNutritionData(matches)) {
      logger.info('No nutrition information found in page text');
      return null;
    }

    const nutritions = createMegaNutritionObject(matches);

    return nutritions;
  } catch (error) {
    logger.error('Error extracting nutrition data:', error);
    return null;
  }
}

async function extractProductData(
  container: Locator,
  categoryName: string
): Promise<Product | null> {
  try {
    const [name, nameEn, description, imageUrl] = await Promise.all([
      container
        .locator(SELECTORS.productData.name)
        .first()
        .textContent()
        .then((text) => text?.trim() || ''),
      container
        .locator(SELECTORS.productData.nameEn)
        .first()
        .textContent()
        .then((text) => text?.trim() || null)
        .catch(() => null),
      container
        .locator(SELECTORS.productData.description)
        .first()
        .textContent()
        .then((text) => text?.trim() || null)
        .catch(() => null),
      container
        .locator(SELECTORS.productData.image)
        .first()
        .getAttribute('src')
        .then((src) => {
          if (!src) {
            return '';
          }
          return src.startsWith('/') ? `${SITE_CONFIG.baseUrl}${src}` : src;
        })
        .catch(() => ''),
    ]);

    if (name && name.length > 0) {
      return {
        name,
        nameEn,
        description,
        price: null,
        externalImageUrl: imageUrl,
        category: 'Drinks',
        externalCategory: categoryName,
        externalId: `mega_${name}`,
        externalUrl: '', // Will be filled by caller
        nutritions: null, // Will be filled when available
      };
    }
  } catch (error) {
    logger.error('Error extracting product data:', error);
  }
  return null;
}

// Helper function to find product containers
async function findMegaProductContainers(
  page: Page
): Promise<{ containers: Locator | null; usedSelector: string }> {
  // Try each selector until we find products
  for (const selector of SELECTORS.productContainers) {
    const containers = page.locator(selector);
    const count = await containers.count();
    if (count > 0) {
      logger.info(`Found ${count} products using selector: ${selector}`);
      return { containers, usedSelector: selector };
    }
  }

  logger.warn('No product containers found with any selector');
  return { containers: null, usedSelector: 'none' };
}

// Helper function to click product image and wait for modal
async function clickMegaProductImage(
  container: Locator,
  productName: string,
  page: Page
): Promise<boolean> {
  const productImage = container.locator(SELECTORS.productData.image).first();
  if ((await productImage.count()) === 0) {
    logger.warn(
      `No product image found for ${productName}, skipping nutrition extraction`
    );
    return false;
  }

  await productImage.click();
  await page.waitForTimeout(3000); // Wait for modal to fully load

  // Wait for modal content to appear
  try {
    await page.waitForSelector('.modal-content', { timeout: 5000 });
    await page.waitForTimeout(1000); // Extra wait for content to populate
    return true;
  } catch (error) {
    logger.warn(`Modal did not appear for ${productName}: ${error}`);
    return false;
  }
}

// Helper function to close modal or navigate back
async function closeMegaModal(page: Page): Promise<void> {
  const closeButton = page.locator(
    '.close, .modal-close, .btn-close, [aria-label="Close"]'
  );

  if ((await closeButton.count()) > 0) {
    try {
      const isVisible = await closeButton.first().isVisible({ timeout: 3000 });
      if (isVisible) {
        await closeButton.first().click({ timeout: 5000 });
        await page.waitForTimeout(500);
        return;
      }
      logger.info('Close button exists but not visible, trying to go back');
    } catch (error) {
      logger.warn(`Could not close modal: ${error}, trying to go back`);
    }
  }

  // If modal close failed or no close button, go back
  try {
    await page.goBack();
    await waitForLoad(page);
  } catch (_error) {
    logger.warn('Could not go back, continuing...');
  }
}

// Helper function to extract nutrition for a single product
async function extractMegaProductNutrition(
  container: Locator,
  product: Product,
  page: Page,
  index: number
): Promise<void> {
  try {
    logger.info(`Attempting to extract nutrition for product: ${product.name}`);

    const modalOpened = await clickMegaProductImage(
      container,
      product.name,
      page
    );
    if (!modalOpened) {
      return;
    }

    // Take debug screenshot to understand the modal structure
    await takeDebugScreenshot(page, `mega-product-modal-${index}`);

    // Try to extract nutrition data
    const nutritions = await extractNutritionData(page);
    if (nutritions) {
      product.nutritions = nutritions;
      logger.info(`✅ Extracted nutrition data for: ${product.name}`);
    } else {
      logger.info(`ℹ️  No nutrition data found for: ${product.name}`);
    }

    await closeMegaModal(page);
  } catch (error) {
    logger.warn(`Could not extract nutrition for ${product.name}: ${error}`);
  }
}

async function extractPageProducts(page: Page, categoryName = 'Default') {
  const products: Product[] = [];

  const { containers: productContainers, usedSelector } =
    await findMegaProductContainers(page);
  if (!productContainers) {
    return { products, usedSelector };
  }

  const containerCount = await productContainers.count();
  logger.info(`Processing all ${containerCount} products`);

  // Process all containers sequentially to handle clicks and modals properly
  for (let i = 0; i < containerCount; i++) {
    const container = productContainers.nth(i);
    const product = await extractProductData(container, categoryName);

    if (product) {
      product.externalUrl = page.url();
      await extractMegaProductNutrition(container, product, page, i);
      products.push(product);
    }
  }

  return { products, usedSelector };
}

async function extractMenuCategories(page: Page) {
  await waitForLoad(page);

  const categories: Array<{ name: string; value: string; url: string }> = [];

  for (const selector of SELECTORS.categoryCheckboxes) {
    const checkboxes = page.locator(selector);
    const count = await checkboxes.count();

    if (count > 0) {
      logger.info(
        `Found ${count} category checkboxes with selector: ${selector}`
      );

      const checkboxPromises = Array.from({ length: count }, async (_, i) => {
        const checkbox = checkboxes.nth(i);
        const [value, name] = await Promise.all([
          checkbox.getAttribute('value').then((v) => v || ''),
          checkbox
            .locator('+ label, ~ label')
            .textContent()
            .then((t) => t?.trim() || `Category ${i + 1}`),
        ]);

        if (value) {
          return {
            name,
            value,
            url: `${SITE_CONFIG.categoryUrlTemplate}${value}`,
          };
        }
        return null;
      });

      const checkboxResults = await Promise.all(checkboxPromises);
      categories.push(
        ...checkboxResults.filter(
          (c): c is { name: string; value: string; url: string } => c !== null
        )
      );
      break;
    }
  }

  // If no categories found, use the main menu page
  if (categories.length === 0) {
    categories.push({
      name: 'All Menu',
      value: 'all',
      url: SITE_CONFIG.startUrl,
    });
  }

  return categories;
}

// ================================================
// PAGE HANDLERS
// ================================================

async function handleMainMenuPage(
  page: Page,
  crawlerInstance: PlaywrightCrawler
) {
  logger.info('Processing Mega MGC Coffee main menu page with pagination');

  await waitForLoad(page);
  await takeDebugScreenshot(page, 'mega-main-menu');

  // Try to discover categories
  const categories = await extractMenuCategories(page);
  logger.info(
    `Found ${categories.length} categories: ${categories.map((c) => c.name).join(', ')}`
  );

  let currentPage = 1;
  let totalProductsExtracted = 0;

  // Handle pagination by clicking through all pages
  while (true) {
    logger.info(`Processing page ${currentPage}...`);

    await waitForLoad(page);

    // Extract products from the current page
    const pageProducts = await extractPageProducts(page, 'All Menu');
    logger.info(
      `Found ${pageProducts.products.length} products on page ${currentPage}`
    );

    // Save products from current page
    await Promise.all(
      pageProducts.products.map(async (product) => {
        await crawlerInstance.pushData(product);
        logger.info(
          `✅ Extracted: ${product.name} - Category: ${product.externalCategory}`
        );
      })
    );
    totalProductsExtracted += pageProducts.products.length;

    // Check if there's a next page button
    const nextButton = page.locator(SELECTORS.pagination.nextButton);
    const nextButtonCount = await nextButton.count();

    if (nextButtonCount === 0) {
      logger.info('No next page button found, pagination complete');
      break;
    }

    // Check if the next button is disabled or not clickable
    const isDisabled = await nextButton
      .evaluate((el) => {
        return (
          el.hasAttribute('disabled') ||
          el.classList.contains('disabled') ||
          el.style.display === 'none' ||
          !(el as HTMLElement).offsetParent
        );
      })
      .catch(() => true);

    if (isDisabled) {
      logger.info('Next page button is disabled, reached end of pagination');
      break;
    }

    // Click the next page button
    try {
      logger.info(
        `Clicking next page button to go to page ${currentPage + 1}...`
      );
      await nextButton.click();
      await waitForLoad(page);
      currentPage++;

      // Safety check to prevent infinite loops
      if (currentPage > CRAWLER_CONFIG.maxPages) {
        logger.warn(
          `Reached maximum page limit (${CRAWLER_CONFIG.maxPages}), stopping pagination`
        );
        break;
      }
    } catch (error) {
      logger.info(`Failed to click next button or no more pages: ${error}`);
      break;
    }
  }

  logger.info(
    `Pagination complete. Total products extracted: ${totalProductsExtracted} across ${currentPage} pages`
  );

  // If we found categories, enqueue them for processing
  if (categories.length > 1) {
    const categoryRequests = categories
      .filter((cat) => cat.value !== 'all')
      .map((category) => ({
        url: category.url,
        userData: {
          categoryName: category.name,
          categoryValue: category.value,
          isCategoryPage: true,
        },
      }));

    await crawlerInstance.addRequests(categoryRequests);
    logger.info(
      `Enqueued ${categoryRequests.length} category pages for processing`
    );
  }
}

async function handleCategoryPage(
  page: Page,
  request: Request,
  crawlerInstance: PlaywrightCrawler
) {
  const categoryName = request.userData.categoryName;
  const categoryValue = request.userData.categoryValue;

  logger.info(`Processing category: ${categoryName} (value: ${categoryValue})`);

  await waitForLoad(page);

  try {
    // Extract products from this category page
    const categoryProducts = await extractPageProducts(page, categoryName);

    logger.info(
      `Found ${categoryProducts.products.length} products in category: ${categoryName}`
    );

    // Limit products in test mode
    const productsToProcess = isTestMode
      ? categoryProducts.products.slice(0, maxProductsInTestMode)
      : categoryProducts.products;

    if (isTestMode) {
      logger.info(
        `🧪 Test mode: limiting to ${productsToProcess.length} products`
      );
    }

    // Save all products from this category
    await Promise.all(
      productsToProcess.map(async (product) => {
        await crawlerInstance.pushData(product);
        logger.info(
          `✅ Extracted: ${product.name} - Category: ${categoryName}`
        );
      })
    );

    // Check for "Load More" functionality (skip in test mode)
    const loadMoreButton = page.locator(SELECTORS.pagination.loadMoreButton);
    const loadMoreCount = await loadMoreButton.count();

    if (loadMoreCount > 0 && !isTestMode) {
      logger.info('Found "Load More" button, attempting to click');
      try {
        await loadMoreButton.first().click();
        await waitForLoad(page);

        // Extract additional products after loading more
        const additionalProducts = await extractPageProducts(
          page,
          categoryName
        );
        await Promise.all(
          additionalProducts.products.map(async (product) => {
            await crawlerInstance.pushData(product);
            logger.info(
              `✅ Additional: ${product.name} - Category: ${categoryName}`
            );
          })
        );
      } catch (error) {
        logger.warn('Could not click "Load More" button:', error);
      }
    }
  } catch (error) {
    logger.error(`❌ Error processing category ${categoryName}: ${error}`);
  }
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const createMegaCrawler = () =>
  new PlaywrightCrawler({
    launchContext: {
      launchOptions: CRAWLER_CONFIG.launchOptions,
    },
    async requestHandler({ page, request, crawler: crawlerInstance }) {
      const url = request.url;

      // Handle main menu page
      if (url.includes('/menu/') && !request.userData?.isCategoryPage) {
        await handleMainMenuPage(page, crawlerInstance);
        return;
      }

      // Handle category pages
      if (request.userData?.isCategoryPage) {
        await handleCategoryPage(page, request, crawlerInstance);
      }
    },
    maxConcurrency: CRAWLER_CONFIG.maxConcurrency,
    maxRequestsPerCrawl: CRAWLER_CONFIG.maxRequestsPerCrawl,
    maxRequestRetries: CRAWLER_CONFIG.maxRequestRetries,
    requestHandlerTimeoutSecs: CRAWLER_CONFIG.requestHandlerTimeoutSecs,
  });

export const runMegaCrawler = async () => {
  const crawler = createMegaCrawler();

  try {
    await crawler.run([SITE_CONFIG.startUrl]);
    const dataset = await crawler.getData();
    await writeProductsToJson(dataset.items as Product[], 'mega');
  } catch (error) {
    logger.error('Mega crawler failed:', error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runMegaCrawler().catch((error) => {
    logger.error('Crawler execution failed:', error);
    process.exit(1);
  });
}
