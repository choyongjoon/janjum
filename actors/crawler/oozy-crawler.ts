import { PlaywrightCrawler, type Request } from 'crawlee';
import type { Locator, Page } from 'playwright';
import { logger } from '../../shared/logger';
import { type Product, waitForLoad, writeProductsToJson } from './crawlerUtils';

// ================================================
// SITE STRUCTURE CONFIGURATION
// ================================================

const SITE_CONFIG = {
  baseUrl: 'https://oozycoffee.com',
  startUrl: 'https://oozycoffee.com/Technology',
  menuCategories: {
    COFFEE: '/Technology',
    'COLD BREW': '/27',
    BEVERAGE: '/28',
    FRAPPE: '/29',
    'ADE & MOJITO': '/30',
    'TEA & JUICE': '/31',
    DESSERT: '/32',
  },
} as const;

// ================================================
// CSS SELECTORS (imweb gallery2 widget)
// ================================================

const SELECTORS = {
  productItem: '._item.item_gallary',
  caption: '[id^="caption_"]',
  name: 'h4',
  description: 'p',
  imageWrap: '.img_wrap[data-src]',
  image: 'img.img-responsive',
} as const;

// ================================================
// CRAWLER CONFIGURATION
// ================================================

const isTestMode = process.env.CRAWLER_TEST_MODE === 'true';
const maxProductsInTestMode = isTestMode
  ? Number.parseInt(process.env.CRAWLER_MAX_PRODUCTS || '3', 10)
  : Number.POSITIVE_INFINITY;
const maxRequestsInTestMode = isTestMode
  ? Number.parseInt(process.env.CRAWLER_MAX_REQUESTS || '10', 10)
  : 50;

const CRAWLER_CONFIG = {
  maxConcurrency: isTestMode ? 2 : 5,
  maxRequestsPerCrawl: isTestMode ? maxRequestsInTestMode : 100,
  maxRequestRetries: 2,
  requestHandlerTimeoutSecs: isTestMode ? 20 : 40,
  launchOptions: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
};

// ================================================
// REGEX PATTERNS
// ================================================

const IMWEB_ID_REGEX = /\/([a-f0-9]{13})\.\w+$/;
const DATA_ORG_ID_REGEX = /([a-f0-9]{13})\.\w+$/;

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

function extractImwebId(value: string): string {
  const match = value.match(IMWEB_ID_REGEX) || value.match(DATA_ORG_ID_REGEX);
  return match ? match[1] : '';
}

async function getImageUrl(item: Locator): Promise<string> {
  const imgWrap = item.locator(SELECTORS.imageWrap).first();
  if ((await imgWrap.count()) > 0) {
    const dataSrc = await imgWrap.getAttribute('data-src');
    if (dataSrc) {
      return dataSrc;
    }
  }

  const img = item.locator(SELECTORS.image).first();
  if ((await img.count()) > 0) {
    return (await img.getAttribute('src')) || '';
  }

  return '';
}

async function extractProductFromItem(
  item: Locator,
  categoryName: string,
  pageUrl: string
): Promise<Product | null> {
  const caption = item.locator(SELECTORS.caption).first();
  if ((await caption.count()) === 0) {
    return null;
  }

  const name = await caption
    .locator(SELECTORS.name)
    .first()
    .textContent()
    .catch(() => '');
  if (!name?.trim()) {
    return null;
  }

  const description = await caption
    .locator(SELECTORS.description)
    .first()
    .textContent()
    .catch(() => '');

  const imageUrl = await getImageUrl(item);

  const externalId =
    extractImwebId(imageUrl) ||
    extractImwebId((await item.getAttribute('data-org')) || '');

  if (!externalId) {
    return null;
  }

  return {
    name: name.trim(),
    nameEn: null,
    description: description?.trim() || null,
    price: null,
    externalImageUrl: imageUrl,
    category: categoryName,
    externalCategory: categoryName,
    externalId,
    externalUrl: pageUrl,
    nutritions: null,
  };
}

async function extractProductsFromPage(
  page: Page,
  categoryName: string
): Promise<Product[]> {
  const products: Product[] = [];
  const seenIds = new Set<string>();

  logger.info(`Extracting products from category: ${categoryName}`);

  await waitForLoad(page);
  await page.waitForTimeout(3000);

  const items = await page.locator(SELECTORS.productItem).all();
  logger.info(`Found ${items.length} items in ${categoryName}`);

  if (items.length === 0) {
    logger.warn(`No product items found for category: ${categoryName}`);
    return [];
  }

  const itemsToProcess = isTestMode
    ? items.slice(0, maxProductsInTestMode)
    : items;

  if (isTestMode) {
    logger.info(`Test mode: limiting to ${itemsToProcess.length} products`);
  }

  for (const item of itemsToProcess) {
    try {
      const product = await extractProductFromItem(
        item,
        categoryName,
        page.url()
      );

      if (product && !seenIds.has(product.externalId)) {
        seenIds.add(product.externalId);
        products.push(product);
        logger.info(`Extracted: ${product.name}`);
      }
    } catch (error) {
      logger.debug(`Failed to extract product: ${error}`);
    }
  }

  logger.info(
    `Successfully extracted ${products.length} products from ${categoryName}`
  );
  return products;
}

// ================================================
// PAGE HANDLERS
// ================================================

async function handleMenuPage(
  page: Page,
  request: Request,
  crawlerInstance: PlaywrightCrawler
) {
  const categoryName = request.userData?.categoryName || 'COFFEE';

  logger.info(`Processing menu page: ${categoryName}`);

  const products = await extractProductsFromPage(page, categoryName);

  await Promise.all(
    products.map((product) => crawlerInstance.pushData(product))
  );

  logger.info(`Added ${products.length} products from ${categoryName}`);
}

async function handleMainPage(page: Page, crawlerInstance: PlaywrightCrawler) {
  logger.info('Processing main page (COFFEE) and discovering categories');

  // The start URL is the COFFEE page, so extract products from it first
  const coffeeProducts = await extractProductsFromPage(page, 'COFFEE');
  await Promise.all(
    coffeeProducts.map((product) => crawlerInstance.pushData(product))
  );
  logger.info(`Added ${coffeeProducts.length} products from COFFEE`);

  // Enqueue remaining category pages (skip COFFEE since we already processed it)
  const categoryRequests = Object.entries(SITE_CONFIG.menuCategories)
    .filter(([name]) => name !== 'COFFEE')
    .map(([categoryName, categoryPath]) => ({
      url: `${SITE_CONFIG.baseUrl}${categoryPath}`,
      userData: {
        categoryName,
        isMenuPage: true,
      },
    }));

  const categoriesToProcess = isTestMode
    ? categoryRequests.slice(0, 2)
    : categoryRequests;

  if (isTestMode) {
    logger.info(
      `Test mode: limiting to ${categoriesToProcess.length} categories`
    );
  }

  await crawlerInstance.addRequests(categoriesToProcess);
  logger.info(
    `Enqueued ${categoriesToProcess.length} category pages for processing`
  );
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const createOozyCrawler = () =>
  new PlaywrightCrawler({
    launchContext: {
      launchOptions: CRAWLER_CONFIG.launchOptions,
    },
    async requestHandler({ page, request, crawler: crawlerInstance }) {
      if (request.userData?.isMenuPage) {
        await handleMenuPage(page, request, crawlerInstance);
      } else {
        await handleMainPage(page, crawlerInstance);
      }
    },
    maxConcurrency: CRAWLER_CONFIG.maxConcurrency,
    maxRequestsPerCrawl: CRAWLER_CONFIG.maxRequestsPerCrawl,
    maxRequestRetries: CRAWLER_CONFIG.maxRequestRetries,
    requestHandlerTimeoutSecs: CRAWLER_CONFIG.requestHandlerTimeoutSecs,
  });

export const runOozyCrawler = async () => {
  const crawler = createOozyCrawler();

  try {
    await crawler.run([SITE_CONFIG.startUrl]);
    const dataset = await crawler.getData();
    await writeProductsToJson(dataset.items as Product[], 'oozy');
  } catch (error) {
    logger.error('Oozy crawler failed:', error);
    throw error;
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runOozyCrawler().catch((error) => {
    logger.error('Crawler execution failed:', error);
    process.exit(1);
  });
}
