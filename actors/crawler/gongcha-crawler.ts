import { PlaywrightCrawler } from 'crawlee';
import type { Locator, Page } from 'playwright';
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
  baseUrl: 'https://brand.gong-cha.co.kr',
  startUrl: 'https://brand.gong-cha.co.kr/m/brand/menu/product.php?c=001001',
} as const;

// ================================================
// CSS SELECTORS
// ================================================

const SELECTORS = {
  // Category selectors
  categories: '.lnb > li > a',

  // Product item selectors
  productItems: '.pro_list_wrap a',

  // Product container selectors (better for extracting individual products)
  productContainers:
    '.pro_list_wrap > div, .pro_list_wrap li, .pro_item, [class*="product"]',

  // Product data extraction from list
  productData: {
    image: 'img',
    name: '', // Will be extracted from img alt or text content
  },

  // Product detail modal selectors
  productDetails: {
    description: '.product p.txt',
    modalContainer: '.product', // For checking if modal is open
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
const CATEGORY_PARAM_REGEX = /.*c=/;

async function extractBasicProductInfo(container: Locator) {
  const imageElement = container.locator('img').first();
  const imageSrc = await imageElement.getAttribute('src').catch(() => '');
  const imageAlt = await imageElement.getAttribute('alt').catch(() => '');

  let productName = imageAlt || '';
  if (!productName) {
    const containerText = (await container.textContent().catch(() => '')) || '';
    productName = containerText.replace(/\s+/g, ' ').trim();
  }

  if (!productName) {
    return null;
  }

  return { name: productName, imageSrc };
}

async function extractDescriptionFromModal(
  page: Page,
  productLink: Locator,
  productName: string
): Promise<string> {
  try {
    const href = await productLink.getAttribute('href').catch(() => '');
    logger.info(`Extracting description for: ${productName} (href: ${href})`);

    // Ensure any existing modal is closed first
    await closeAnyOpenModal(page);

    await productLink.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    await productLink.click({ timeout: 8000 });
    await page.waitForTimeout(1000); // Wait for modal to load

    // Only take screenshot in test mode for debugging
    if (isTestMode) {
      await takeDebugScreenshot(
        page,
        `gongcha-modal-${productName.replace(/\s+/g, '_')}`
      );
    }

    const modalSelector = '.product p.txt';
    const descElement = page.locator(modalSelector);

    const description = (await descElement.textContent()) || '';
    const trimmed = description.trim();
    logger.info(
      `Found description with selector "${modalSelector}": "${trimmed.substring(0, 50)}..."`
    );

    if (trimmed && trimmed.length > 5) {
      // Ensure we have meaningful content
      return trimmed;
    }

    logger.warn(`No description found for ${productName}`);
    return '';
  } catch (error) {
    logger.error(`Click failed for ${productName}: ${error}`);
    return '';
  } finally {
    await closeAnyOpenModal(page);
  }
}

async function closeAnyOpenModal(page: Page): Promise<void> {
  try {
    const closeSelector = '.layer_close';
    const closeButton = page.locator(closeSelector).first();
    if (await closeButton.isVisible({ timeout: 300 })) {
      await closeButton.click();
      await page.waitForTimeout(300);
      return; // Exit early if successful
    }

    // Final fallback: click outside
    await page.mouse.click(50, 50).catch(() => {
      // Ignore click errors
    });
    await page.waitForTimeout(300);
  } catch (error) {
    logger.debug(`Error closing modal: ${error}`);
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
    const productLink = container.locator('a').first();

    const description = await extractDescriptionFromModal(
      page,
      productLink,
      productName
    );
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
      externalUrl: page.url(),
      price: null,
      category: categoryName,
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
  // Try to get category name from active navigation
  try {
    const activeCategory = await page
      .locator('.lnb li.on a, .lnb li.active a')
      .textContent()
      .catch(() => '');
    if (activeCategory?.trim()) {
      const categoryName = activeCategory.trim();
      logger.info(`Category name from active navigation: ${categoryName}`);
      return categoryName;
    }
  } catch (error) {
    logger.warn(`Could not extract category name from page: ${error}`);
  }

  return 'Tea'; // Default fallback
}

async function extractProductsFromPage(
  page: Page,
  categoryName: string
): Promise<Product[]> {
  const products: Product[] = [];

  // Try to extract products using containers first, then fallback to links
  let productContainers = await page.locator(SELECTORS.productContainers).all();

  if (productContainers.length === 0) {
    // Fallback to direct links
    productContainers = await page.locator(SELECTORS.productItems).all();
  }

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
    await page.waitForTimeout(200);
  }

  return products;
}

async function handleStartPage(
  page: Page,
  crawlerInstance: PlaywrightCrawler
): Promise<void> {
  logger.info(
    'Processing Gongcha start page - extracting category URLs and processing current page products'
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

    // Then extract category URLs and add remaining categories to queue
    const categoryUrls = await extractCategoryUrlsFromPage(page);

    if (categoryUrls.length === 0) {
      logger.error('No category URLs found on start page');
      return;
    }

    const currentUrl = page.url();

    // Add all category URLs to the request queue, except the current one since we already processed it
    for (const url of categoryUrls) {
      if (url !== currentUrl) {
        await crawlerInstance.addRequests([{ url, label: 'category' }]);
        logger.info(`Added category URL to queue: ${url}`);
      } else {
        logger.info(`Skipping current URL (already processed): ${url}`);
      }
    }

    logger.info(
      `Successfully queued ${categoryUrls.filter((url) => url !== currentUrl).length} additional category pages`
    );
  } catch (error) {
    logger.error(`Error processing start page: ${error}`);
  }
}

async function handleCategoryPage(
  page: Page,
  crawlerInstance: PlaywrightCrawler
): Promise<void> {
  logger.info('Processing Gongcha category page');

  await waitForLoad(page);
  await takeDebugScreenshot(page, 'gongcha-category');

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
      `Processed ${productsToProcess.length} products from Gongcha category`
    );
  } catch (error) {
    logger.error(`Error extracting products from category page: ${error}`);
  }
}

// ================================================
// CATEGORY URL EXTRACTION
// ================================================

async function extractCategoryUrlsFromPage(page: Page): Promise<string[]> {
  try {
    logger.info('Extracting category URLs from navigation menu...');

    // Wait for navigation to load
    await page.waitForSelector('.lnb', { timeout: 10_000 });

    // Get all category links from navigation
    const categoryLinks = await page.locator('.lnb > li > a').all();
    const categoryUrls: string[] = [];

    for (const link of categoryLinks) {
      const href = await link.getAttribute('href').catch(() => '');
      const text = await link.textContent().catch(() => '');

      if (href && text?.trim()) {
        let fullUrl: string;

        if (href.startsWith('http')) {
          fullUrl = href;
        } else {
          // Construct the mobile menu URL with the category parameter
          const categoryParam = href.includes('?')
            ? href.split('?')[1]
            : href.replace(CATEGORY_PARAM_REGEX, 'c=');
          fullUrl = `${SITE_CONFIG.baseUrl}/m/brand/menu/product.php?${categoryParam}`;
        }

        categoryUrls.push(fullUrl);
        logger.info(`Found category: ${text.trim()} -> ${fullUrl}`);
      }
    }

    logger.info(`Extracted ${categoryUrls.length} category URLs from page`);
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
    logger.info('🚀 Starting Gongcha crawler with dynamic category extraction');

    // Step 1: Create crawler and start with the initial URL
    const crawler = createGongchaCrawler();

    // Step 2: Start crawling from the main menu page
    // The crawler will first extract category URLs, then crawl each category
    await crawler.run([SITE_CONFIG.startUrl]);

    const dataset = await crawler.getData();
    await writeProductsToJson(dataset.items as Product[], 'gongcha');

    logger.info(
      `✅ Successfully crawled all categories: ${dataset.items.length} total products`
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
