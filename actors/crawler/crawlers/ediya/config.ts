import type { Locator, Page } from 'playwright';
import type { Nutritions } from '../../../../shared/nutritions';
import { defineCrawler, type ExtractorContext } from '../../core';
import { parseNumericValue } from '../../extractors';

// ================================================
// SITE CONFIGURATION
// ================================================

export const EDIYA_CONFIG = {
  brand: 'ediya',
  baseUrl: 'https://ediya.com',
  startUrl: 'https://ediya.com/contents/drink.html',
  categoryUrlTemplate: 'https://ediya.com/contents/drink.html?chked_val=',
} as const;

// ================================================
// SELECTORS
// ================================================

export const EDIYA_SELECTORS = {
  productContainers: '#menu_ul > li',
  productData: {
    name: '.menu_tt > a > span',
    nameEn: 'div.detail_con > h2 > span',
    description: '.detail_txt',
    image: '> a > img',
  },
  categoryCheckboxes: 'input[name="chkList"]',
  nutrition: '.pro_comp',
  pagination: {
    loadMore: 'a:has-text("더보기")',
  },
} as const;

// ================================================
// REGEX PATTERNS
// ================================================

const GIFT_SUFFIX_REGEX = /\s*선물하기\s*$/;
const SERVING_SIZE_ML_REGEX = /(\d+(?:\.\d+)?)ml/;
const NUTRITION_VALUE_REGEX = /\(([0-9.]+)(?:kcal|g|mg)\)/;

// ================================================
// NUTRITION EXTRACTION
// ================================================

export async function extractEdiyaNutrition(
  element: Locator,
  _context: ExtractorContext
): Promise<Nutritions | null> {
  try {
    const nutritionElement = element.locator('.pro_comp');

    if ((await nutritionElement.count()) === 0) {
      return null;
    }

    const nutrition: Nutritions = {};

    // Extract serving size from .pro_size element
    const sizeElement = nutritionElement.locator('.pro_size');
    if ((await sizeElement.count()) > 0) {
      const sizeText = await sizeElement.textContent();
      if (sizeText) {
        const sizeMatch = sizeText.match(SERVING_SIZE_ML_REGEX);
        if (sizeMatch) {
          nutrition.servingSize = Number.parseFloat(sizeMatch[1]);
          nutrition.servingSizeUnit = 'ml';
        }
      }
    }

    // Extract nutrition data from .pro_nutri dl elements
    const nutritionItems = await nutritionElement
      .locator('.pro_nutri dl')
      .all();

    for (const item of nutritionItems) {
      const dtElement = item.locator('dt');
      const ddElement = item.locator('dd');

      if ((await dtElement.count()) === 0 || (await ddElement.count()) === 0) {
        continue;
      }

      const label = (await dtElement.textContent())?.trim().toLowerCase() || '';
      const valueText = (await ddElement.textContent())?.trim() || '';

      // Extract numeric value from parentheses
      const valueMatch = valueText.match(NUTRITION_VALUE_REGEX);
      if (!valueMatch) {
        continue;
      }

      const numValue = Number.parseFloat(valueMatch[1]);
      if (Number.isNaN(numValue)) {
        continue;
      }

      if (label.includes('칼로리')) {
        nutrition.calories = numValue;
        nutrition.caloriesUnit = 'kcal';
      } else if (label.includes('당류')) {
        nutrition.sugar = numValue;
        nutrition.sugarUnit = 'g';
      } else if (label.includes('단백질')) {
        nutrition.protein = numValue;
        nutrition.proteinUnit = 'g';
      } else if (label.includes('포화지방')) {
        nutrition.saturatedFat = numValue;
        nutrition.saturatedFatUnit = 'g';
      } else if (label.includes('나트륨')) {
        nutrition.natrium = numValue;
        nutrition.natriumUnit = 'mg';
      } else if (label.includes('카페인')) {
        nutrition.caffeine = numValue;
        nutrition.caffeineUnit = 'mg';
      }
    }

    return Object.keys(nutrition).length > 0 ? nutrition : null;
  } catch {
    return null;
  }
}

// ================================================
// CATEGORY EXTRACTION
// ================================================

export async function extractEdiyaCategories(
  page: Page,
  context: ExtractorContext
): Promise<Array<{ name: string; url: string }>> {
  const categories: Array<{ name: string; url: string }> = [];

  try {
    await page.waitForSelector(EDIYA_SELECTORS.categoryCheckboxes, {
      timeout: 10_000,
    });
    const checkboxes = await page
      .locator(EDIYA_SELECTORS.categoryCheckboxes)
      .all();

    for (const checkbox of checkboxes) {
      const [value, label] = await Promise.all([
        checkbox.getAttribute('value'),
        checkbox.evaluate((el) => {
          const parent = el.closest('label') || el.parentElement;
          return parent?.textContent?.trim() || '';
        }),
      ]);

      if (value && label) {
        categories.push({
          name: label,
          url: `${EDIYA_CONFIG.categoryUrlTemplate}${value},&skeyword=#blockcate`,
        });
      }
    }
  } catch {
    // Return empty array on error
  }

  return categories;
}

// ================================================
// CUSTOM PRODUCT EXTRACTOR
// ================================================

export async function extractEdiyaProduct(
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
        .locator(EDIYA_SELECTORS.productData.name)
        .textContent()
        .then((text) => {
          if (!text) {
            return '';
          }
          return text.trim().replace(GIFT_SUFFIX_REGEX, '');
        }),
      container
        .locator(EDIYA_SELECTORS.productData.nameEn)
        .textContent()
        .then((text) => text?.trim() || null)
        .catch(() => null),
      container
        .locator(EDIYA_SELECTORS.productData.description)
        .textContent()
        .then((text) => text?.trim() || null)
        .catch(() => null),
      container
        .locator(EDIYA_SELECTORS.productData.image)
        .getAttribute('src')
        .then((src) => {
          if (!src) {
            return '';
          }
          if (src.startsWith('/')) {
            return `${context.baseUrl}${src}`;
          }
          if (src.startsWith('http')) {
            return src;
          }
          return `${context.baseUrl}/${src}`;
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

export const ediyaDefinition = defineCrawler({
  config: {
    brand: EDIYA_CONFIG.brand,
    baseUrl: EDIYA_CONFIG.baseUrl,
    startUrl: EDIYA_CONFIG.startUrl,
  },
  selectors: {
    productContainers: EDIYA_SELECTORS.productContainers,
    productData: EDIYA_SELECTORS.productData,
    nutrition: EDIYA_SELECTORS.nutrition,
    pagination: EDIYA_SELECTORS.pagination,
  },
  strategy: 'inline-data',
  pagination: 'load-more',
  options: {
    maxConcurrency: 2,
    maxRequestsPerCrawl: 50,
    maxRequestRetries: 2,
    requestHandlerTimeoutSecs: 120,
  },
  extractProduct: extractEdiyaProduct,
  extractNutrition: extractEdiyaNutrition,
  extractCategories: extractEdiyaCategories,
});
