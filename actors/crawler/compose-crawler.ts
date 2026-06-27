import { PlaywrightCrawler, type Request } from "crawlee";
import type { Locator, Page } from "playwright";
import { logger } from "../../shared/logger";
import type { Nutritions } from "../../shared/nutritions";
import { type Product, waitForLoad, writeProductsToJson } from "./crawlerUtils";

// ================================================
// SITE STRUCTURE CONFIGURATION
// ================================================

const SITE_CONFIG = {
  baseUrl: "https://composecoffee.com",
  // Menu lives on a Rhymix-powered listing. Without a category_srl the listing
  // shows a default category; we use it only to discover the category nav.
  startUrl:
    "https://composecoffee.com/index.php?mid=compose&act=dispCafemenuGalleryList",
} as const;

// The "추천메뉴" (recommended) category only re-lists products that already
// appear in their real categories, so we skip it to keep category labels clean.
const SKIP_CATEGORY_IDS = new Set(["301298"]);

// ================================================
// CSS SELECTORS
// ================================================

const SELECTORS = {
  // Category navigation on the listing page
  categoryLinks: "a.cafemenu-category-btn",

  // Product cards on a category listing page
  productItems: "a.cafemenu-menu-item",

  // Pagination on a category listing page
  pagination: '.pagination a[href*="page="]',

  // Product detail page
  detail: {
    title: "#detailTitle",
    image: "#detailImage",
    nutritionItem: ".cafemenu-nutrition-item",
    nutritionLabel: ".cafemenu-nutrition-label",
    nutritionValue: ".cafemenu-nutrition-value",
    nutritionUnit: ".cafemenu-nutrition-unit",
  },
} as const;

// ================================================
// REGEX PATTERNS
// ================================================

const PATTERNS = {
  itemSrl: /item_srl=(\d+)/,
  pageNumber: /[?&]page=(\d+)/,
  number: /-?\d+(?:\.\d+)?/,
} as const;

// ================================================
// CRAWLER CONFIGURATION
// ================================================

const isTestMode = process.env.CRAWLER_TEST_MODE === "true";
const maxProductsInTestMode = isTestMode
  ? Number.parseInt(process.env.CRAWLER_MAX_PRODUCTS || "3", 10)
  : Number.POSITIVE_INFINITY;
const maxRequestsInTestMode = isTestMode
  ? Number.parseInt(process.env.CRAWLER_MAX_REQUESTS || "10", 10)
  : 1000;

const CRAWLER_CONFIG = {
  maxConcurrency: Number.parseInt(
    process.env.CRAWLER_MAX_CONCURRENCY || "3",
    10
  ),
  maxRequestsPerCrawl: maxRequestsInTestMode,
  maxRequestRetries: 2,
  requestHandlerTimeoutSecs: isTestMode ? 30 : 60,
  launchOptions: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  },
};

// ================================================
// HELPERS
// ================================================

function toAbsoluteUrl(url: string): string {
  // Resolve against the site base so any relative form (root-relative
  // "/index.php", document-relative "index.php?...", or already-absolute
  // URLs) normalizes correctly.
  try {
    return new URL(url, SITE_CONFIG.baseUrl).href;
  } catch {
    return url;
  }
}

// Maps a Korean nutrition label to the matching Nutritions field + default unit.
const NUTRITION_FIELDS = {
  무게: { value: "servingSize", unit: "servingSizeUnit", defaultUnit: "g" },
  컵용량: { value: "servingSize", unit: "servingSizeUnit", defaultUnit: "ml" },
  용량: { value: "servingSize", unit: "servingSizeUnit", defaultUnit: "ml" },
  칼로리: { value: "calories", unit: "caloriesUnit", defaultUnit: "kcal" },
  나트륨: { value: "natrium", unit: "natriumUnit", defaultUnit: "mg" },
  탄수화물: {
    value: "carbohydrates",
    unit: "carbohydratesUnit",
    defaultUnit: "g",
  },
  당류: { value: "sugar", unit: "sugarUnit", defaultUnit: "g" },
  지방: { value: "fat", unit: "fatUnit", defaultUnit: "g" },
  포화지방: {
    value: "saturatedFat",
    unit: "saturatedFatUnit",
    defaultUnit: "g",
  },
  트랜스지방: { value: "transFat", unit: "transFatUnit", defaultUnit: "g" },
  콜레스테롤: {
    value: "cholesterol",
    unit: "cholesterolUnit",
    defaultUnit: "mg",
  },
  단백질: { value: "protein", unit: "proteinUnit", defaultUnit: "g" },
  카페인: { value: "caffeine", unit: "caffeineUnit", defaultUnit: "mg" },
} as const satisfies Record<
  string,
  { value: keyof Nutritions; unit: keyof Nutritions; defaultUnit: string }
>;

function isKnownLabel(label: string): label is keyof typeof NUTRITION_FIELDS {
  return label in NUTRITION_FIELDS;
}

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

async function extractNutritionRow(item: Locator) {
  const [label, valueText, unit] = await Promise.all([
    item
      .locator(SELECTORS.detail.nutritionLabel)
      .textContent()
      .then((t) => t?.trim() || ""),
    item
      .locator(SELECTORS.detail.nutritionValue)
      .textContent()
      .then((t) => t?.trim() || ""),
    item
      .locator(SELECTORS.detail.nutritionUnit)
      .textContent()
      .then((t) => t?.trim() || "")
      .catch(() => ""),
  ]);
  return { label, valueText, unit };
}

async function extractDetailNutrition(page: Page): Promise<Nutritions | null> {
  const items = page.locator(SELECTORS.detail.nutritionItem);
  const count = await items.count();
  if (count === 0) {
    return null;
  }

  const rows = await Promise.all(
    Array.from({ length: count }, (_, i) => extractNutritionRow(items.nth(i)))
  );

  const nutrition: Nutritions = {};
  for (const { label, valueText, unit } of rows) {
    if (!isKnownLabel(label)) {
      continue;
    }
    const match = valueText.match(PATTERNS.number);
    if (!match) {
      continue;
    }
    const field = NUTRITION_FIELDS[label];
    nutrition[field.value] = Number.parseFloat(match[0]);
    nutrition[field.unit] = unit || field.defaultUnit;
  }

  return Object.keys(nutrition).length > 0 ? nutrition : null;
}

async function extractCategories(page: Page) {
  const links = page.locator(SELECTORS.categoryLinks);
  const count = await links.count();

  const results = await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const link = links.nth(i);
      const [href, dataCategory, text] = await Promise.all([
        link.getAttribute("href"),
        link.getAttribute("data-category"),
        link.textContent().then((t) => t?.trim() || ""),
      ]);
      if (href && dataCategory && text) {
        return { url: toAbsoluteUrl(href), id: dataCategory, name: text };
      }
      return null;
    })
  );

  // De-duplicate by category id while dropping skipped categories.
  const seen = new Set<string>();
  const categories: Array<{ url: string; id: string; name: string }> = [];
  for (const category of results) {
    if (
      category &&
      !SKIP_CATEGORY_IDS.has(category.id) &&
      !seen.has(category.id)
    ) {
      seen.add(category.id);
      categories.push(category);
    }
  }
  return categories;
}

async function extractMaxPage(page: Page): Promise<number> {
  const links = page.locator(SELECTORS.pagination);
  const count = await links.count();
  if (count === 0) {
    return 1;
  }

  const hrefs = await Promise.all(
    Array.from({ length: count }, (_, i) => links.nth(i).getAttribute("href"))
  );

  let maxPage = 1;
  for (const href of hrefs) {
    const match = href?.match(PATTERNS.pageNumber);
    if (match) {
      const pageNum = Number.parseInt(match[1], 10);
      if (pageNum > maxPage) {
        maxPage = pageNum;
      }
    }
  }
  return maxPage;
}

async function extractProductLinks(page: Page) {
  const items = page.locator(SELECTORS.productItems);
  const count = await items.count();

  const results = await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const href = await items.nth(i).getAttribute("href");
      if (!href) {
        return null;
      }
      const match = href.match(PATTERNS.itemSrl);
      if (!match) {
        return null;
      }
      return { url: toAbsoluteUrl(href), itemSrl: match[1] };
    })
  );

  return results.filter((link) => link !== null);
}

// ================================================
// PAGE HANDLERS
// ================================================

async function handleListingDiscovery(
  page: Page,
  crawlerInstance: PlaywrightCrawler
) {
  logger.info("Processing menu listing to discover categories");
  await waitForLoad(page);

  const categories = await extractCategories(page);
  logger.info(`Found ${categories.length} categories`);

  const requests = categories.map((category) => ({
    url: category.url,
    userData: {
      isCategoryPage: true,
      categoryId: category.id,
      categoryName: category.name,
      page: 1,
    },
  }));
  await crawlerInstance.addRequests(requests);
  logger.info(`Enqueued ${categories.length} category pages for processing`);
}

async function handleCategoryPage(
  page: Page,
  request: Request,
  crawlerInstance: PlaywrightCrawler
) {
  const { categoryId, categoryName } = request.userData;
  const currentPage = request.userData.page || 1;

  logger.info(
    `Processing category: ${categoryName} (ID: ${categoryId}, Page: ${currentPage})`
  );

  await waitForLoad(page);

  let productLinks = await extractProductLinks(page);
  if (isTestMode) {
    productLinks = productLinks.slice(0, maxProductsInTestMode);
  }

  logger.info(
    `Found ${productLinks.length} products on page ${currentPage} of ${categoryName}`
  );

  const detailRequests = productLinks.map((link) => ({
    url: link.url,
    userData: {
      isDetailPage: true,
      itemSrl: link.itemSrl,
      categoryName,
    },
  }));
  await crawlerInstance.addRequests(detailRequests);

  // Enqueue remaining pages from page 1 only (skip in test mode).
  if (currentPage === 1 && !isTestMode) {
    const maxPage = await extractMaxPage(page);
    if (maxPage > 1) {
      const baseUrl = request.url.split("?")[0];
      const search = new URL(request.url).search;
      const pageRequests = Array.from({ length: maxPage - 1 }, (_, index) => {
        const pageNum = index + 2;
        const params = new URLSearchParams(search);
        params.set("page", String(pageNum));
        return {
          url: `${baseUrl}?${params.toString()}`,
          userData: {
            isCategoryPage: true,
            categoryId,
            categoryName,
            page: pageNum,
          },
        };
      });
      await crawlerInstance.addRequests(pageRequests);
      logger.info(`Enqueued pages 2-${maxPage} for category: ${categoryName}`);
    }
  }
}

async function handleDetailPage(
  page: Page,
  request: Request,
  crawlerInstance: PlaywrightCrawler
) {
  const { itemSrl, categoryName } = request.userData;

  try {
    await waitForLoad(page);

    const [name, imageSrc, nutritions] = await Promise.all([
      page
        .locator(SELECTORS.detail.title)
        .textContent()
        .then((t) => t?.trim() || ""),
      page
        .locator(SELECTORS.detail.image)
        .getAttribute("src")
        .then((src) => (src ? toAbsoluteUrl(src) : ""))
        .catch(() => ""),
      extractDetailNutrition(page),
    ]);

    if (!name) {
      logger.warn(`No product name found at ${request.url}`);
      return;
    }

    const product: Product = {
      name,
      nameEn: null,
      description: null,
      price: null,
      externalImageUrl: imageSrc,
      category: "Drinks",
      externalCategory: categoryName,
      externalId: `compose_${itemSrl}`,
      externalUrl: request.url,
      nutritions,
    };

    await crawlerInstance.pushData(product);
    logger.info(`✅ Extracted: ${name} - Category: ${categoryName}`);
  } catch (error) {
    logger.error(`❌ Error processing product ${itemSrl}: ${error}`);
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
      if (request.userData?.isDetailPage) {
        await handleDetailPage(page, request, crawlerInstance);
        return;
      }

      if (request.userData?.isCategoryPage) {
        await handleCategoryPage(page, request, crawlerInstance);
        return;
      }

      await handleListingDiscovery(page, crawlerInstance);
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
    await writeProductsToJson(dataset.items as Product[], "compose");
  } catch (error) {
    logger.error("Compose crawler failed:", error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runComposeCrawler().catch((error) => {
    logger.error("Crawler execution failed:", error);
    process.exit(1);
  });
}
