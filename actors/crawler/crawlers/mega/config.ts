import type { Locator, Page } from 'playwright';
import { logger } from '../../../../shared/logger';
import type { Nutritions } from '../../../../shared/nutritions';
import { defineCrawler, type ExtractorContext } from '../../core';

// ================================================
// SITE CONFIGURATION
// ================================================

export const MEGA_CONFIG = {
  brand: 'mega',
  baseUrl: 'https://www.mega-mgccoffee.com',
  startUrl: 'https://www.mega-mgccoffee.com/menu/',
} as const;

// ================================================
// SELECTORS
// ================================================

export const MEGA_SELECTORS = {
  productContainers: 'ul#menu_list > li',
  productData: {
    name: '.cont_text_title',
    nameEn: '.cont_text_info div.text1',
    description: '.cont_text_info div.text2',
    image: 'img',
  },
  pagination: {
    nextButton: '.board_page_next',
  },
  modal: {
    container: '.inner_modal[style*="display: block"]',
    close: '.inner_modal .close',
    servingInfo: '.cont_text .cont_text_inner',
    nutritionItems: '.cont_list ul li',
  },
} as const;

// ================================================
// REGEX PATTERNS
// ================================================

const REGEX_PATTERNS = {
  servingSize: /(\d+(?:\.\d+)?)ml/,
  calories: /(\d+(?:\.\d+)?)kcal/,
  grams: /(\d+(?:\.\d+)?)g/,
  mg: /(\d+(?:\.\d+)?)mg/,
} as const;

// ================================================
// MODAL HANDLING
// ================================================

async function closeModal(page: Page): Promise<void> {
  try {
    const closeButton = page.locator(MEGA_SELECTORS.modal.close);
    if ((await closeButton.count()) > 0) {
      await closeButton.click();
      await page.waitForSelector(MEGA_SELECTORS.modal.container, {
        state: 'hidden',
        timeout: 1000,
      });
    }
  } catch {
    try {
      await page.keyboard.press('Escape');
    } catch {
      // Ignore escape errors
    }
  }
}

function parseServingInfo(servingInfo: string[], nutrition: Nutritions): void {
  for (const info of servingInfo) {
    const servingSizeMatch = info.match(REGEX_PATTERNS.servingSize);
    if (servingSizeMatch) {
      nutrition.servingSize = Number.parseFloat(servingSizeMatch[1]);
      nutrition.servingSizeUnit = 'ml';
    }

    const caloriesMatch = info.match(REGEX_PATTERNS.calories);
    if (caloriesMatch) {
      nutrition.calories = Number.parseFloat(caloriesMatch[1]);
      nutrition.caloriesUnit = 'kcal';
    }
  }
}

function parseNutritionItem(item: string, nutrition: Nutritions): void {
  if (item.includes('포화지방')) {
    const match = item.match(REGEX_PATTERNS.grams);
    if (match) {
      nutrition.saturatedFat = Number.parseFloat(match[1]);
      nutrition.saturatedFatUnit = 'g';
    }
    return;
  }

  if (item.includes('당류')) {
    const match = item.match(REGEX_PATTERNS.grams);
    if (match) {
      nutrition.sugar = Number.parseFloat(match[1]);
      nutrition.sugarUnit = 'g';
    }
    return;
  }

  if (item.includes('나트륨')) {
    const match = item.match(REGEX_PATTERNS.mg);
    if (match) {
      nutrition.natrium = Number.parseFloat(match[1]);
      nutrition.natriumUnit = 'mg';
    }
    return;
  }

  if (item.includes('단백질')) {
    const match = item.match(REGEX_PATTERNS.grams);
    if (match) {
      nutrition.protein = Number.parseFloat(match[1]);
      nutrition.proteinUnit = 'g';
    }
    return;
  }

  if (item.includes('카페인')) {
    const match = item.match(REGEX_PATTERNS.mg);
    if (match) {
      nutrition.caffeine = Number.parseFloat(match[1]);
      nutrition.caffeineUnit = 'mg';
    }
  }
}

export async function extractMegaNutritionFromModal(
  page: Page,
  productContainer: Locator
): Promise<Nutritions | null> {
  try {
    // Click on the product image to open modal
    const productImage = productContainer
      .locator(MEGA_SELECTORS.productData.image)
      .first();
    if ((await productImage.count()) === 0) {
      return null;
    }

    await productImage.click();

    // Wait for modal to appear
    await page.waitForSelector(MEGA_SELECTORS.modal.container, {
      timeout: 1000,
    });

    const innerModal = page.locator(MEGA_SELECTORS.modal.container);

    // Extract serving info (size and calories)
    const servingInfo = await innerModal
      .locator(MEGA_SELECTORS.modal.servingInfo)
      .allTextContents();

    // Extract nutrition items from the list
    const nutritionItems = await innerModal
      .locator(MEGA_SELECTORS.modal.nutritionItems)
      .allTextContents();

    if (servingInfo.length === 0 && nutritionItems.length === 0) {
      await closeModal(page);
      return null;
    }

    const nutrition: Nutritions = {};
    parseServingInfo(servingInfo, nutrition);

    for (const item of nutritionItems) {
      parseNutritionItem(item, nutrition);
    }

    // Close the modal
    await closeModal(page);

    if (Object.keys(nutrition).length > 0) {
      return nutrition;
    }

    return null;
  } catch (error) {
    logger.debug(`Error extracting nutrition from modal: ${error}`);
    try {
      await closeModal(page);
    } catch {
      // Ignore close errors
    }
    return null;
  }
}

// ================================================
// PRODUCT EXTRACTION (without nutrition - will be added by handler)
// ================================================

export async function extractMegaProduct(
  container: Locator,
  context: ExtractorContext
): Promise<{
  name: string;
  nameEn: string | null;
  description: string | null;
  imageUrl: string;
  price: number | null;
} | null> {
  try {
    const [name, nameEn, description, imageUrl] = await Promise.all([
      container
        .locator(MEGA_SELECTORS.productData.name)
        .first()
        .textContent()
        .then((text) => text?.trim() || ''),
      container
        .locator(MEGA_SELECTORS.productData.nameEn)
        .first()
        .textContent()
        .then((text) => text?.trim() || null)
        .catch(() => null),
      container
        .locator(MEGA_SELECTORS.productData.description)
        .first()
        .textContent()
        .then((text) => text?.trim() || null)
        .catch(() => null),
      container
        .locator(MEGA_SELECTORS.productData.image)
        .first()
        .getAttribute('src')
        .then((src) => {
          if (!src) {
            return '';
          }
          return src.startsWith('/') ? `${context.baseUrl}${src}` : src;
        })
        .catch(() => ''),
    ]);

    if (name && name.length > 0) {
      return {
        name,
        nameEn,
        description,
        imageUrl,
        price: null,
      };
    }
  } catch {
    // Skip products that fail to extract
  }
  return null;
}

// ================================================
// CRAWLER DEFINITION
// ================================================

export const megaDefinition = defineCrawler({
  config: {
    brand: MEGA_CONFIG.brand,
    baseUrl: MEGA_CONFIG.baseUrl,
    startUrl: MEGA_CONFIG.startUrl,
  },
  selectors: {
    productContainers: MEGA_SELECTORS.productContainers,
    productData: MEGA_SELECTORS.productData,
    pagination: MEGA_SELECTORS.pagination,
  },
  strategy: 'modal',
  pagination: 'next-button',
  options: {
    maxConcurrency: 1,
    maxRequestsPerCrawl: 10,
    maxRequestRetries: 2,
    requestHandlerTimeoutSecs: 300,
  },
  extractProduct: extractMegaProduct,
});
