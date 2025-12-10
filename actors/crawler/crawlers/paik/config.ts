import type { Locator } from 'playwright';
import type { Nutritions } from '../../../../shared/nutritions';
import { defineCrawler, type ExtractorContext } from '../../core';
import { parseNumericValue } from '../../extractors';

// ================================================
// SITE CONFIGURATION
// ================================================

export const PAIK_CONFIG = {
  brand: 'paik',
  baseUrl: 'https://paikdabang.com',
  startUrl: 'https://paikdabang.com/menu/menu_new/',
} as const;

// ================================================
// SELECTORS
// ================================================

export const PAIK_SELECTORS = {
  productContainers: '.menu_list > ul > li',
  productData: {
    name: 'p.menu_tit',
    description: 'p.txt',
    image: 'img',
  },
  categoryLinks: 'ul.page_tab a',
  nutrition: '.ingredient_table_box',
} as const;

// ================================================
// NUTRITION EXTRACTION
// ================================================

// Regex for parsing serving size from Paik nutrition label
const SERVING_SIZE_REGEX = /(\d+)\s*oz/;

function parseServingSize(
  basisText: string
): { size: number; unit: string } | null {
  const servingSizeMatch = basisText.match(SERVING_SIZE_REGEX);
  if (servingSizeMatch) {
    // Convert oz to ml (1 oz = 29.5735 ml)
    const ozValue = Number.parseInt(servingSizeMatch[1], 10);
    return {
      size: Math.round(ozValue * 29.5735),
      unit: 'ml',
    };
  }
  return null;
}

function parseNutritionItem(label: string, value: string): Partial<Nutritions> {
  const numValue = parseNumericValue(value);
  if (numValue === null) {
    return {};
  }

  const normalizedLabel = label.trim().toLowerCase();

  if (normalizedLabel.includes('카페인')) {
    return { caffeine: numValue, caffeineUnit: 'mg' };
  }
  if (normalizedLabel.includes('칼로리')) {
    return { calories: numValue, caloriesUnit: 'kcal' };
  }
  if (normalizedLabel.includes('나트륨')) {
    return { natrium: numValue, natriumUnit: 'mg' };
  }
  if (normalizedLabel.includes('당류')) {
    return { sugar: numValue, sugarUnit: 'g' };
  }
  if (normalizedLabel.includes('포화지방')) {
    return { saturatedFat: numValue, saturatedFatUnit: 'g' };
  }
  if (normalizedLabel.includes('단백질')) {
    return { protein: numValue, proteinUnit: 'g' };
  }

  return {};
}

export async function extractPaikNutrition(
  element: Locator,
  _context: ExtractorContext
): Promise<Nutritions | null> {
  try {
    const nutritionBox = element.locator('.ingredient_table_box');

    if ((await nutritionBox.count()) === 0) {
      return null;
    }

    const nutrition: Nutritions = {};

    // Extract serving size from the basis text
    const basisText = await nutritionBox
      .locator('.menu_ingredient_basis')
      .textContent()
      .catch(() => '');

    if (basisText) {
      const servingData = parseServingSize(basisText);
      if (servingData) {
        nutrition.servingSize = servingData.size;
        nutrition.servingSizeUnit = servingData.unit;
      }
    }

    // Extract nutrition values from the structured table
    const nutritionItems = await nutritionBox
      .locator('.ingredient_table li')
      .all();

    for (const item of nutritionItems) {
      const divs = await item.locator('div').allTextContents();
      if (divs.length !== 2) {
        continue;
      }

      const itemData = parseNutritionItem(divs[0], divs[1]);
      Object.assign(nutrition, itemData);
    }

    return Object.keys(nutrition).length > 0 ? nutrition : null;
  } catch {
    return null;
  }
}

// ================================================
// CATEGORY EXTRACTION
// ================================================

export async function extractPaikCategories(
  page: import('playwright').Page,
  context: ExtractorContext
): Promise<Array<{ name: string; url: string }>> {
  const categories: Array<{ name: string; url: string }> = [];

  try {
    const tabs = await page.locator(PAIK_SELECTORS.categoryLinks).all();

    for (const tab of tabs) {
      const [text, href] = await Promise.all([
        tab.textContent(),
        tab.getAttribute('href'),
      ]);

      if (text && href) {
        const categoryName = text.trim();

        // Skip 신메뉴 (New Menu) to avoid duplicates
        if (categoryName === '신메뉴') {
          continue;
        }

        const fullUrl = href.startsWith('http')
          ? href
          : `${context.baseUrl}${href}`;

        categories.push({ name: categoryName, url: fullUrl });
      }
    }
  } catch {
    // Return empty array on error
  }

  return categories;
}

// ================================================
// CRAWLER DEFINITION
// ================================================

export const paikDefinition = defineCrawler({
  config: {
    brand: PAIK_CONFIG.brand,
    baseUrl: PAIK_CONFIG.baseUrl,
    startUrl: PAIK_CONFIG.startUrl,
  },
  selectors: {
    productContainers: PAIK_SELECTORS.productContainers,
    productData: PAIK_SELECTORS.productData,
    categoryLinks: PAIK_SELECTORS.categoryLinks,
    nutrition: PAIK_SELECTORS.nutrition,
  },
  strategy: 'inline-data',
  pagination: 'none',
  options: {
    maxConcurrency: 2,
    maxRequestsPerCrawl: 30,
    requestHandlerTimeoutSecs: 45,
  },
  extractNutrition: extractPaikNutrition,
  extractCategories: extractPaikCategories,
});
