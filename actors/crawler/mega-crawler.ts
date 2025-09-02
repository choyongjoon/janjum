import { PlaywrightCrawler, type Request } from 'crawlee';
import type { Locator, Page } from 'playwright';
import { logger } from '../../shared/logger';
import type { Nutritions } from '../../shared/nutritions';
import { type Product, waitForLoad, writeProductsToJson } from './crawlerUtils';

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
  modalServingSize: /(\d+(?:\.\d+)?)ml/,
  modalCalories: /(\d+(?:\.\d+)?)kcal/,
  modalGrams: /(\d+(?:\.\d+)?)g/,
  modalMg: /(\d+(?:\.\d+)?)mg/,
} as const;

// ================================================
// CSS SELECTORS
// ================================================

const SELECTORS = {
  // Product container selectors (multiple strategies)
  productContainers: ['ul#menu_list > li'],

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

// Helper function to parse serving information
function parseServingInfo(servingInfo: string[], nutrition: Nutritions): void {
  for (const info of servingInfo) {
    const servingSizeMatch = info.match(REGEX_PATTERNS.modalServingSize);
    if (servingSizeMatch) {
      nutrition.servingSize = Number.parseFloat(servingSizeMatch[1]);
      nutrition.servingSizeUnit = 'ml';
    }

    const caloriesMatch = info.match(REGEX_PATTERNS.modalCalories);
    if (caloriesMatch) {
      nutrition.calories = Number.parseFloat(caloriesMatch[1]);
      nutrition.caloriesUnit = 'kcal';
    }
  }
}

// Helper function to parse individual nutrition item
function parseNutritionItem(item: string, nutrition: Nutritions): void {
  if (item.includes('포화지방')) {
    const match = item.match(REGEX_PATTERNS.modalGrams);
    if (match) {
      nutrition.saturatedFat = Number.parseFloat(match[1]);
      nutrition.saturatedFatUnit = 'g';
    }
    return;
  }

  if (item.includes('당류')) {
    const match = item.match(REGEX_PATTERNS.modalGrams);
    if (match) {
      nutrition.sugar = Number.parseFloat(match[1]);
      nutrition.sugarUnit = 'g';
    }
    return;
  }

  if (item.includes('나트륨')) {
    const match = item.match(REGEX_PATTERNS.modalMg);
    if (match) {
      nutrition.natrium = Number.parseFloat(match[1]);
      nutrition.natriumUnit = 'mg';
    }
    return;
  }

  if (item.includes('단백질')) {
    const match = item.match(REGEX_PATTERNS.modalGrams);
    if (match) {
      nutrition.protein = Number.parseFloat(match[1]);
      nutrition.proteinUnit = 'g';
    }
    return;
  }

  if (item.includes('카페인')) {
    const match = item.match(REGEX_PATTERNS.modalMg);
    if (match) {
      nutrition.caffeine = Number.parseFloat(match[1]);
      nutrition.caffeineUnit = 'mg';
    }
  }
}

// Helper function to parse nutrition items
function parseNutritionItems(
  nutritionItems: string[],
  nutrition: Nutritions
): void {
  for (const item of nutritionItems) {
    parseNutritionItem(item, nutrition);
  }
}

// Extract nutrition data from modal after clicking product
async function extractNutritionDataFromModal(
  page: Page,
  productContainer: Locator
): Promise<Nutritions | null> {
  try {
    logger.debug('Attempting to click product to open modal');

    // Click on the product image to open modal
    const productImage = productContainer
      .locator(SELECTORS.productData.image)
      .first();
    if ((await productImage.count()) === 0) {
      logger.debug('No product image found to click');
      return null;
    }

    await productImage.click();

    // Wait for modal to appear
    await page.waitForSelector('.inner_modal[style*="display: block"]', {
      timeout: 1000,
    });

    logger.debug('Modal opened, extracting nutrition data');

    const innerModal = page.locator('.inner_modal[style*="display: block"]');

    // Extract serving info (size and calories)
    const servingInfo = await innerModal
      .locator('.cont_text .cont_text_inner')
      .allTextContents();

    // Extract nutrition items from the list
    const nutritionItems = await innerModal
      .locator('.cont_list ul li')
      .allTextContents();

    if (servingInfo.length === 0 && nutritionItems.length === 0) {
      logger.debug('No nutrition information found in modal');
      await closeModal(page);
      return null;
    }

    const nutrition: Nutritions = {};
    parseServingInfo(servingInfo, nutrition);
    parseNutritionItems(nutritionItems, nutrition);

    // Close the modal
    await closeModal(page);

    if (Object.keys(nutrition).length > 0) {
      logger.debug('Successfully extracted nutrition data from modal');
      return nutrition;
    }

    logger.debug('No nutrition information found in modal');
    return null;
  } catch (error) {
    logger.debug(`Error extracting nutrition data from modal: ${error}`);
    // Try to close modal if it's open
    try {
      await closeModal(page);
    } catch (closeError) {
      logger.debug(`Error closing modal: ${closeError}`);
    }
    return null;
  }
}

// Helper function to close modal
async function closeModal(page: Page): Promise<void> {
  try {
    const closeButton = page.locator('.inner_modal .close');
    if ((await closeButton.count()) > 0) {
      await closeButton.click();
      await page.waitForSelector('.inner_modal[style*="display: block"]', {
        state: 'hidden',
        timeout: 1000,
      });
    }
  } catch (error) {
    logger.debug(`Could not close modal: ${error}`);
    // Press escape as fallback
    try {
      await page.keyboard.press('Escape');
    } catch (escapeError) {
      logger.debug(`Could not press escape: ${escapeError}`);
    }
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
        nutritions: undefined, // Will be filled when available
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

async function extractPageProducts(page: Page, categoryName = 'Default') {
  const products: Product[] = [];

  const { containers: productContainers, usedSelector } =
    await findMegaProductContainers(page);
  if (!productContainers) {
    return { products, usedSelector };
  }

  const containerCount = await productContainers.count();

  // Limit products in test mode
  const maxProducts = isTestMode ? maxProductsInTestMode : containerCount;
  const actualCount = Math.min(containerCount, maxProducts);

  logger.info(
    `Processing ${actualCount} products (found ${containerCount} total)`
  );

  // Process containers sequentially
  for (let i = 0; i < actualCount; i++) {
    const container = productContainers.nth(i);
    const product = await extractProductData(container, categoryName);

    if (product) {
      product.externalUrl = page.url();

      // Extract nutrition data by clicking product to open modal
      try {
        const nutritions = await extractNutritionDataFromModal(page, container);
        if (nutritions) {
          product.nutritions = nutritions;
          logger.info(`✅ Found nutrition data for: ${product.name}`);
        } else {
          logger.debug(`No nutrition data found for: ${product.name}`);
        }
      } catch (error) {
        logger.debug(
          `Could not extract nutrition for ${product.name}: ${error}`
        );
      }

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
