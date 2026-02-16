import { PlaywrightCrawler, type Request } from 'crawlee';
import type { Page } from 'playwright';
import { logger } from '../../shared/logger';
import type { Nutritions } from '../../shared/nutritions';
import { type Product, waitForLoad, writeProductsToJson } from './crawlerUtils';

// ================================================
// SITE STRUCTURE CONFIGURATION
// ================================================

const SITE_CONFIG = {
  baseUrl: 'https://www.theventi.co.kr',
  menuBaseUrl: 'https://www.theventi.co.kr/new2022/menu/all.html',
  detailBaseUrl: 'https://www.theventi.co.kr/new2022/menu/all-view.new.html',
  menuCategories: {
    커피: 2,
    디카페인: 3,
    '아이스 블렌디드': 4,
    '주스/에이드': 5,
    '버블티/티': 6,
    베버리지: 7,
    '사이드메뉴/RTD': 8,
  },
} as const;

// ================================================
// CSS SELECTORS
// ================================================

const SELECTORS = {
  productLink: 'a[href*="all-view.new.html"]',
  detailName: 'p.tit',
  detailImage: '.img_bx img',
  detailDescription: '.txt.scroll-con-y',
  nutritionTable: 'table.table',
} as const;

// ================================================
// REGEX PATTERNS
// ================================================

const SERVING_SIZE_REGEX = /(\d+)\s*(ml|g)/i;
const NUMERIC_REGEX = /[\d.]+/;
const UID_PATTERN = 'uid=(\\d+)';

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
  maxConcurrency: isTestMode ? 1 : 3,
  maxRequestsPerCrawl: isTestMode ? maxRequestsInTestMode : 300,
  maxRequestRetries: 2,
  requestHandlerTimeoutSecs: isTestMode ? 30 : 120,
  launchOptions: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
};

// ================================================
// GLOBAL STATE
// ================================================

const seenUids = new Set<string>();

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

function parseNumericValue(text: string): number | undefined {
  const match = text.match(NUMERIC_REGEX);
  return match ? Number.parseFloat(match[0]) : undefined;
}

async function extractProductLinksFromListing(
  page: Page
): Promise<Array<{ uid: string; name: string }>> {
  await waitForLoad(page);
  await page.waitForTimeout(2000);

  return page.evaluate(
    ({ selector, uidPattern }) => {
      const links = document.querySelectorAll(selector);
      const uidRegex = new RegExp(uidPattern);
      const uniqueProducts = new Map<string, { uid: string; name: string }>();

      for (const link of links) {
        const href = link.getAttribute('href');
        const match = href?.match(uidRegex);
        if (match) {
          const uid = match[1];
          if (!uniqueProducts.has(uid)) {
            uniqueProducts.set(uid, {
              uid,
              name: link.textContent?.trim() || '',
            });
          }
        }
      }

      return [...uniqueProducts.values()];
    },
    { selector: SELECTORS.productLink, uidPattern: UID_PATTERN }
  );
}

function extractNutritionTableData(
  page: Page
): Promise<{ headers: string[]; values: string[] } | null> {
  return page.evaluate((tableSelector: string) => {
    const table = document.querySelector(tableSelector);
    if (!table) {
      return null;
    }

    const headers: string[] = [];
    const values: string[] = [];

    for (const th of table.querySelectorAll('thead th')) {
      headers.push(th.textContent?.trim() || '');
    }
    for (const td of table.querySelectorAll('tbody td')) {
      values.push(td.textContent?.trim() || '');
    }

    if (headers.length > 3 && values.length > 0) {
      return { headers, values };
    }

    return null;
  }, SELECTORS.nutritionTable);
}

async function extractNutritionFromDetailPage(
  page: Page
): Promise<Nutritions | null> {
  try {
    const nutritionData = await extractNutritionTableData(page);
    if (!nutritionData) {
      return null;
    }
    return mapNutritionData(nutritionData.headers, nutritionData.values);
  } catch (error) {
    logger.debug(`Failed to extract nutrition: ${error}`);
    return null;
  }
}

type NutritionFieldKey =
  | 'calories'
  | 'sugar'
  | 'protein'
  | 'saturatedFat'
  | 'natrium'
  | 'caffeine';

const NUTRITION_FIELD_MAP: Array<{
  keyword: string;
  field: NutritionFieldKey;
  unit: string;
}> = [
  { keyword: '열량', field: 'calories', unit: 'kcal' },
  { keyword: 'kcal', field: 'calories', unit: 'kcal' },
  { keyword: '당류', field: 'sugar', unit: 'g' },
  { keyword: '단백질', field: 'protein', unit: 'g' },
  { keyword: '포화지방', field: 'saturatedFat', unit: 'g' },
  { keyword: '나트륨', field: 'natrium', unit: 'mg' },
  { keyword: '카페인', field: 'caffeine', unit: 'mg' },
];

function applyServingSize(nutrition: Nutritions, value: string): boolean {
  const sizeMatch = value.match(SERVING_SIZE_REGEX);
  if (sizeMatch) {
    nutrition.servingSize = Number.parseFloat(sizeMatch[1]);
    nutrition.servingSizeUnit = sizeMatch[2].toLowerCase();
    return true;
  }
  return false;
}

function mapNutritionData(
  headers: string[],
  values: string[]
): Nutritions | null {
  const nutrition: Nutritions = {};
  let hasData = false;

  for (const [index, header] of headers.entries()) {
    const value = values[index];
    if (!value || value === '-') {
      continue;
    }

    if (header.includes('제공량')) {
      hasData = applyServingSize(nutrition, value) || hasData;
      continue;
    }

    const mapping = NUTRITION_FIELD_MAP.find((m) => header.includes(m.keyword));
    if (mapping) {
      nutrition[mapping.field] = parseNumericValue(value);
      const unitKey = `${mapping.field}Unit` as keyof Nutritions;
      (nutrition as Record<string, unknown>)[unitKey] = mapping.unit;
      hasData = true;
    }
  }

  return hasData ? nutrition : null;
}

async function extractProductDetailFromPage(page: Page): Promise<{
  name: string;
  imageUrl: string;
  description: string | null;
  nutritions: Nutritions | null;
} | null> {
  await waitForLoad(page);
  await page.waitForTimeout(1000);

  // Product name is in p.tit — last <span> child that isn't .tag
  const name = await page
    .evaluate((selector: string) => {
      const tit = document.querySelector(selector);
      if (!tit) {
        return '';
      }
      const spans = [...tit.querySelectorAll('span:not(.tag)')];
      const lastSpan = spans.at(-1);
      return lastSpan?.textContent?.trim() || tit.textContent?.trim() || '';
    }, SELECTORS.detailName)
    .catch(() => '');

  if (!name) {
    return null;
  }

  const imageUrl = await page
    .locator(SELECTORS.detailImage)
    .first()
    .getAttribute('src', { timeout: 3000 })
    .then((src) => {
      if (!src) {
        return '';
      }
      return src.startsWith('http')
        ? src
        : `${SITE_CONFIG.baseUrl}${src.startsWith('/') ? '' : '/'}${src}`;
    })
    .catch(() => '');

  const description = await page
    .locator(SELECTORS.detailDescription)
    .first()
    .textContent({ timeout: 3000 })
    .then((text) => {
      const cleaned = text?.trim().replace(/\s+/g, ' ') || null;
      return cleaned && cleaned.length > 5 ? cleaned : null;
    })
    .catch(() => null);

  const nutritions = await extractNutritionFromDetailPage(page);

  return { name, imageUrl, description, nutritions };
}

// ================================================
// PAGE HANDLERS
// ================================================

async function handleListingPage(
  page: Page,
  request: Request,
  crawlerInstance: PlaywrightCrawler
) {
  const categoryName = request.userData?.categoryName as string;
  logger.info(`Processing listing page: ${categoryName}`);

  const productLinks = await extractProductLinksFromListing(page);
  logger.info(
    `Found ${productLinks.length} products in ${categoryName} (before dedup)`
  );

  const newProducts = productLinks.filter(({ uid }) => !seenUids.has(uid));
  for (const { uid } of newProducts) {
    seenUids.add(uid);
  }

  logger.info(
    `${newProducts.length} new products after dedup (${productLinks.length - newProducts.length} skipped)`
  );

  const productsToProcess = isTestMode
    ? newProducts.slice(0, maxProductsInTestMode)
    : newProducts;

  if (isTestMode && productsToProcess.length < newProducts.length) {
    logger.info(`Test mode: limiting to ${productsToProcess.length} products`);
  }

  const detailRequests = productsToProcess.map(({ uid, name }) => ({
    url: `${SITE_CONFIG.detailBaseUrl}?uid=${uid}`,
    userData: {
      isDetailPage: true,
      categoryName,
      uid,
      productName: name,
    },
  }));

  await crawlerInstance.addRequests(detailRequests);
  logger.info(
    `Enqueued ${detailRequests.length} detail pages from ${categoryName}`
  );
}

async function handleDetailPage(
  page: Page,
  request: Request,
  crawlerInstance: PlaywrightCrawler
) {
  const { categoryName, uid } = request.userData;
  const detailUrl = request.url;

  const detail = await extractProductDetailFromPage(page);

  if (!detail) {
    logger.warn(`Failed to extract product detail from ${detailUrl}`);
    return;
  }

  const product: Product = {
    name: detail.name,
    nameEn: null,
    description: detail.description,
    price: null,
    externalImageUrl: detail.imageUrl,
    category: null,
    externalCategory: categoryName,
    externalId: `theventi_${uid}`,
    externalUrl: detailUrl,
    nutritions: detail.nutritions,
  };

  await crawlerInstance.pushData(product);
  logger.info(
    `Extracted: ${detail.name} (uid=${uid})${detail.nutritions ? ' with nutrition' : ''}`
  );
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const createTheventiCrawler = () =>
  new PlaywrightCrawler({
    launchContext: {
      launchOptions: CRAWLER_CONFIG.launchOptions,
    },
    async requestHandler({ page, request, crawler: crawlerInstance }) {
      if (request.userData?.isDetailPage) {
        await handleDetailPage(page, request, crawlerInstance);
      } else {
        await handleListingPage(page, request, crawlerInstance);
      }
    },
    maxConcurrency: CRAWLER_CONFIG.maxConcurrency,
    maxRequestsPerCrawl: CRAWLER_CONFIG.maxRequestsPerCrawl,
    maxRequestRetries: CRAWLER_CONFIG.maxRequestRetries,
    requestHandlerTimeoutSecs: CRAWLER_CONFIG.requestHandlerTimeoutSecs,
  });

export const runTheventiCrawler = async () => {
  const crawler = createTheventiCrawler();

  const startUrls = Object.entries(SITE_CONFIG.menuCategories).map(
    ([categoryName, mode]) => ({
      url: `${SITE_CONFIG.menuBaseUrl}?mode=${mode}`,
      userData: { categoryName, isDetailPage: false },
    })
  );

  const urlsToProcess = isTestMode ? startUrls.slice(0, 2) : startUrls;

  if (isTestMode) {
    logger.info(
      `Test mode: processing ${urlsToProcess.length}/${startUrls.length} categories`
    );
  }

  try {
    await crawler.run(urlsToProcess);
    const dataset = await crawler.getData();
    await writeProductsToJson(dataset.items as Product[], 'theventi');
  } catch (error) {
    logger.error('TheVenti crawler failed:', error);
    throw error;
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  runTheventiCrawler().catch((error) => {
    logger.error('Crawler execution failed:', error);
    process.exit(1);
  });
}
