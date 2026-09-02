import { PlaywrightCrawler, type Request } from "crawlee";
import type { Page } from "playwright";
import { logger } from "../../shared/logger";
import type { Nutritions } from "../../shared/nutritions";
import { type Product, waitForLoad, writeProductsToJson } from "./crawlerUtils";
import { buildMegaExternalId } from "./megaProductId";

// ================================================
// SITE STRUCTURE CONFIGURATION
// ================================================

const SITE_CONFIG = {
  baseUrl: "https://www.mega-mgccoffee.com",
  startUrl: "https://www.mega-mgccoffee.com/menu/",
  categoryUrlTemplate: "https://www.mega-mgccoffee.com/menu/?menu_category1=",
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
  productContainers: ["ul#menu_list > li"],

  // Product data selectors
  productData: {
    name: ".cont_text_title",
    nameEn: ".cont_text_info div.text1",
    description: ".cont_text_info div.text2",
    image: "img",
  },

  // Category discovery selectors
  categoryCheckboxes: [
    'input[name="list_checkbox"]',
    ".category-filter input",
    ".menu-category input",
    'input[type="checkbox"][data-category]',
  ],

  // Pagination selectors
  pagination: {
    nextButton: ".board_page_next",
    loadMoreButton:
      'button:has-text("더보기"), .load-more, button:has-text("Load More")',
  },
} as const;

// ================================================
// CRAWLER CONFIGURATION
// ================================================

// Test mode configuration
const isTestMode = process.env.CRAWLER_TEST_MODE === "true";
const maxProductsInTestMode = isTestMode
  ? Number.parseInt(process.env.CRAWLER_MAX_PRODUCTS || "3", 10)
  : Number.POSITIVE_INFINITY;
const maxRequestsInTestMode = isTestMode
  ? Number.parseInt(process.env.CRAWLER_MAX_REQUESTS || "10", 10)
  : 10;

const CRAWLER_CONFIG = {
  maxConcurrency: 1, // Single concurrency for pagination
  maxRequestsPerCrawl: isTestMode ? maxRequestsInTestMode : 10,
  maxRequestRetries: 2,
  requestHandlerTimeoutSecs: isTestMode ? 60 : 300, // 1 minute for test, 5 minutes for pagination
  maxPages: isTestMode ? 1 : 50, // Single page in test mode
  launchOptions: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
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
      nutrition.servingSizeUnit = "ml";
    }

    const caloriesMatch = info.match(REGEX_PATTERNS.modalCalories);
    if (caloriesMatch) {
      nutrition.calories = Number.parseFloat(caloriesMatch[1]);
      nutrition.caloriesUnit = "kcal";
    }
  }
}

// Helper function to parse individual nutrition item
function parseNutritionItem(item: string, nutrition: Nutritions): void {
  if (item.includes("포화지방")) {
    const match = item.match(REGEX_PATTERNS.modalGrams);
    if (match) {
      nutrition.saturatedFat = Number.parseFloat(match[1]);
      nutrition.saturatedFatUnit = "g";
    }
    return;
  }

  if (item.includes("당류")) {
    const match = item.match(REGEX_PATTERNS.modalGrams);
    if (match) {
      nutrition.sugar = Number.parseFloat(match[1]);
      nutrition.sugarUnit = "g";
    }
    return;
  }

  if (item.includes("나트륨")) {
    const match = item.match(REGEX_PATTERNS.modalMg);
    if (match) {
      nutrition.natrium = Number.parseFloat(match[1]);
      nutrition.natriumUnit = "mg";
    }
    return;
  }

  if (item.includes("단백질")) {
    const match = item.match(REGEX_PATTERNS.modalGrams);
    if (match) {
      nutrition.protein = Number.parseFloat(match[1]);
      nutrition.proteinUnit = "g";
    }
    return;
  }

  if (item.includes("카페인")) {
    const match = item.match(REGEX_PATTERNS.modalMg);
    if (match) {
      nutrition.caffeine = Number.parseFloat(match[1]);
      nutrition.caffeineUnit = "mg";
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

/**
 * Every menu item carries its full detail panel in the DOM already, inside a
 * hidden `.inner_modal` sibling. The crawler used to click each product open,
 * wait for the modal, read it, then close it -- ~225 products x four Playwright
 * round-trips, which blew past `requestHandlerTimeoutSecs` every single run.
 * Crawlee then retried the whole page twice more, and because `pushData` keeps
 * what earlier attempts already wrote, the output ended up with three copies of
 * every product (675 rows for a 225-item menu).
 *
 * Reading the hidden panel directly makes a page one `evaluate` call, so the
 * crawl finishes well inside its budget. It also fixes a correctness bug: the
 * click-based version read whichever modal happened to be visible, so products
 * occasionally picked up a neighbour's nutrition (an Americano with 5g of
 * saturated fat).
 */
interface RawMegaProduct {
  description: string | null;
  imageUrl: string;
  name: string;
  nameEn: string | null;
  nutritionItems: string[];
  servingInfo: string[];
  temperature: string | null;
}

/**
 * NOTE: everything inside the `$$eval` callback is serialised and run in the
 * page, where none of the bundler's runtime exists. Do not extract named helper
 * functions here -- tsx/esbuild instruments named functions with a `__name(...)`
 * call, which is undefined in the browser and fails the whole crawl with
 * "ReferenceError: __name is not defined". Inline selectors only.
 */
async function extractRawProducts(page: Page): Promise<RawMegaProduct[]> {
  return await page.$$eval("ul#menu_list > li", (items) =>
    items.map((li) => {
      const modal = li.querySelector(".inner_modal");

      return {
        name: li.querySelector(".cont_text_title")?.textContent?.trim() || "",
        nameEn:
          li.querySelector(".cont_text_info div.text1")?.textContent?.trim() ||
          null,
        description:
          li.querySelector(".cont_text_info div.text2")?.textContent?.trim() ||
          null,
        imageUrl: li.querySelector("img")?.getAttribute("src") ?? "",
        // "HOT" / "ICE" badge on the card. Mega lists the hot and iced versions
        // of a drink as two separate items under the same name, so this is the
        // only thing that tells them apart.
        temperature:
          li.querySelector(".cont_gallery_list_label")?.textContent?.trim() ||
          null,
        servingInfo: modal
          ? Array.from(
              modal.querySelectorAll(".cont_text .cont_text_inner")
            ).map((node) => node.textContent?.trim() || "")
          : [],
        nutritionItems: modal
          ? Array.from(modal.querySelectorAll(".cont_list ul li")).map(
              (node) => node.textContent?.trim() || ""
            )
          : [],
      };
    })
  );
}

function toProduct(raw: RawMegaProduct, categoryName: string): Product | null {
  if (!raw.name) {
    return null;
  }

  const nutrition: Nutritions = {};
  parseServingInfo(raw.servingInfo, nutrition);
  parseNutritionItems(raw.nutritionItems, nutrition);

  const imageUrl = raw.imageUrl.startsWith("/")
    ? `${SITE_CONFIG.baseUrl}${raw.imageUrl}`
    : raw.imageUrl;

  return {
    name: raw.name,
    nameEn: raw.nameEn,
    description: raw.description,
    price: null,
    externalImageUrl: imageUrl,
    category: "Drinks",
    externalCategory: categoryName,
    externalId: buildMegaExternalId(raw.name, raw.temperature),
    externalUrl: "",
    nutritions: Object.keys(nutrition).length > 0 ? nutrition : undefined,
  };
}

async function extractPageProducts(page: Page, categoryName = "Default") {
  const raw = await extractRawProducts(page);

  if (raw.length === 0) {
    logger.warn("No product containers found with selector: ul#menu_list > li");
    return { products: [], usedSelector: "none" };
  }

  // Limit products in test mode
  const maxProducts = isTestMode ? maxProductsInTestMode : raw.length;
  const limited = raw.slice(0, Math.min(raw.length, maxProducts));

  logger.info(
    `Processing ${limited.length} products (found ${raw.length} total)`
  );

  const products: Product[] = [];
  for (const item of limited) {
    const product = toProduct(item, categoryName);
    if (product) {
      product.externalUrl = page.url();
      products.push(product);
    }
  }

  const withNutrition = products.filter((p) => p.nutritions).length;
  logger.info(
    `Extracted ${products.length} products (${withNutrition} with nutrition data)`
  );

  return { products, usedSelector: "ul#menu_list > li" };
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
          checkbox.getAttribute("value").then((v) => v || ""),
          checkbox
            .locator("+ label, ~ label")
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
      name: "All Menu",
      value: "all",
      url: SITE_CONFIG.startUrl,
    });
  }

  return categories;
}

// ================================================
// PAGE HANDLERS
// ================================================

/**
 * The pager is driven by JS, not navigation, so `waitForLoad` returns
 * immediately after a click and the next `$$eval` would re-read the page we
 * just left. (The old click-per-product extraction was slow enough to hide
 * this.) Wait for the pager's own "current page" marker to actually move.
 */
async function readCurrentPageNumber(page: Page): Promise<number> {
  const text = await page
    .locator("#board_page .board_page_check span")
    .first()
    .textContent()
    .catch(() => null);
  return Number.parseInt(text?.trim() ?? "", 10);
}

async function waitForPageChange(
  page: Page,
  previousPage: number
): Promise<boolean> {
  try {
    await page.waitForFunction(
      (previous) => {
        const marker = document.querySelector(
          "#board_page .board_page_check span"
        );
        const current = Number.parseInt(marker?.textContent?.trim() ?? "", 10);
        return Number.isFinite(current) && current !== previous;
      },
      previousPage,
      { timeout: 10_000 }
    );
    return true;
  } catch {
    logger.warn(
      `Page did not advance from ${previousPage} within 10s; stopping pagination`
    );
    return false;
  }
}

async function handleMainMenuPage(
  page: Page,
  crawlerInstance: PlaywrightCrawler
) {
  logger.info("Processing Mega MGC Coffee main menu page with pagination");

  await waitForLoad(page);

  // Try to discover categories
  const categories = await extractMenuCategories(page);
  logger.info(
    `Found ${categories.length} categories: ${categories.map((c) => c.name).join(", ")}`
  );

  let currentPage = 1;
  let totalProductsExtracted = 0;

  // Handle pagination by clicking through all pages
  while (true) {
    logger.info(`Processing page ${currentPage}...`);

    await waitForLoad(page);

    // Extract products from the current page
    const pageProducts = await extractPageProducts(page, "All Menu");
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
      logger.info("No next page button found, pagination complete");
      break;
    }

    // Check if the next button is disabled or not clickable
    const isDisabled = await nextButton
      .evaluate((el) => {
        return (
          el.hasAttribute("disabled") ||
          el.classList.contains("disabled") ||
          el.style.display === "none" ||
          !(el as HTMLElement).offsetParent
        );
      })
      .catch(() => true);

    if (isDisabled) {
      logger.info("Next page button is disabled, reached end of pagination");
      break;
    }

    // Click the next page button
    try {
      logger.info(
        `Clicking next page button to go to page ${currentPage + 1}...`
      );
      const pageBeforeClick = await readCurrentPageNumber(page);
      await nextButton.click();

      if (!(await waitForPageChange(page, pageBeforeClick))) {
        break;
      }
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
      .filter((cat) => cat.value !== "all")
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
      if (url.includes("/menu/") && !request.userData?.isCategoryPage) {
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
    const stats = await crawler.run([SITE_CONFIG.startUrl]);
    const dataset = await crawler.getData();
    const items = dataset.items as Product[];

    // A timed-out request is reclaimed and retried, and everything it already
    // pushed stays in the dataset -- so a total failure still produced a
    // plausible-looking file and the run reported success. Refuse to write a
    // file built from failed attempts.
    if (stats.requestsFailed > 0) {
      throw new Error(
        `Mega crawler had ${stats.requestsFailed} failed request(s) after retries; refusing to write ${items.length} products from incomplete attempts`
      );
    }

    // Belt and braces: if a retry ever does slip through, never write the same
    // externalId twice -- the uploader would just overwrite the same record.
    const seen = new Set<string>();
    const unique = items.filter((item) => {
      if (seen.has(item.externalId)) {
        return false;
      }
      seen.add(item.externalId);
      return true;
    });

    if (unique.length !== items.length) {
      logger.warn(
        `Dropped ${items.length - unique.length} duplicate product(s) before writing`
      );
    }

    await writeProductsToJson(unique, "mega");
  } catch (error) {
    logger.error("Mega crawler failed:", error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runMegaCrawler().catch((error) => {
    logger.error("Crawler execution failed:", error);
    process.exit(1);
  });
}
