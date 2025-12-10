import type { Locator, Page } from 'playwright';
import type { Nutritions } from '../../../../shared/nutritions';
import { defineCrawler, type ExtractorContext } from '../../core';

// ================================================
// SITE CONFIGURATION
// ================================================

export const COMPOSE_CONFIG = {
  brand: 'compose',
  baseUrl: 'https://composecoffee.com',
  startUrl: 'https://composecoffee.com/menu',
} as const;

// ================================================
// SELECTORS
// ================================================

export const COMPOSE_SELECTORS = {
  productContainers: '.itemBox',
  productData: {
    id: '> div[id]',
    name: 'h3.undertitle',
    image: '.rthumbnailimg',
  },
  categoryLinks: '.dropdown-menu a[href*="/menu/category/"]',
  nutrition: 'ul.info.g-0',
  pagination: {
    pageLinks: 'a[href*="page="], .pagination a, .page-link',
  },
} as const;

// ================================================
// REGEX PATTERNS
// ================================================

const COMPOSE_NUTRITION_PATTERNS = {
  servingSize: /용량\s*:\s*(\d+(?:\.\d+)?)\s*(ml|oz)/i,
  calories: /열량\s*\(\s*kcal\s*\)\s*:\s*(\d+(?:\.\d+)?)/i,
  sodium: /나트륨\s*\(\s*mg\s*\)\s*:\s*(\d+(?:\.\d+)?)/i,
  carbohydrates: /탄수화물\s*\(\s*g\s*\)\s*:\s*(\d+(?:\.\d+)?)/i,
  sugar: /당류\s*\(\s*g\s*\)\s*:\s*(\d+(?:\.\d+)?)/i,
  fat: /지방\s*\(\s*g\s*\)\s*:\s*(\d+(?:\.\d+)?)/i,
  saturatedFat: /포화지방\s*\(\s*g\s*\)\s*:\s*(\d+(?:\.\d+)?)/i,
  protein: /단백질\s*\(\s*g\s*\)\s*:\s*(\d+(?:\.\d+)?)/i,
} as const;

const CATEGORY_ID_PATTERN = /\/menu\/category\/(\d+)/;

// ================================================
// NUTRITION EXTRACTION
// ================================================

export async function extractComposeNutrition(
  element: Locator,
  _context: ExtractorContext
): Promise<Nutritions | null> {
  try {
    const nutritionInfo = await element
      .locator('ul.info.g-0')
      .textContent()
      .then((text) => text?.trim() || '')
      .catch(() => '');

    if (!nutritionInfo) {
      return null;
    }

    const nutrition: Nutritions = {};

    // Extract serving size
    const servingSizeMatch = nutritionInfo.match(
      COMPOSE_NUTRITION_PATTERNS.servingSize
    );
    if (servingSizeMatch) {
      let servingSize = Number.parseFloat(servingSizeMatch[1]);
      let unit = servingSizeMatch[2].toLowerCase();

      // Convert oz to ml if needed
      if (unit === 'oz') {
        servingSize *= 29.5735;
        unit = 'ml';
      }

      nutrition.servingSize = servingSize;
      nutrition.servingSizeUnit = unit;
    }

    // Extract calories
    const caloriesMatch = nutritionInfo.match(
      COMPOSE_NUTRITION_PATTERNS.calories
    );
    if (caloriesMatch) {
      nutrition.calories = Number.parseFloat(caloriesMatch[1]);
      nutrition.caloriesUnit = 'kcal';
    }

    // Extract sodium
    const sodiumMatch = nutritionInfo.match(COMPOSE_NUTRITION_PATTERNS.sodium);
    if (sodiumMatch) {
      nutrition.natrium = Number.parseFloat(sodiumMatch[1]);
      nutrition.natriumUnit = 'mg';
    }

    // Extract carbohydrates
    const carbohydratesMatch = nutritionInfo.match(
      COMPOSE_NUTRITION_PATTERNS.carbohydrates
    );
    if (carbohydratesMatch) {
      nutrition.carbohydrates = Number.parseFloat(carbohydratesMatch[1]);
      nutrition.carbohydratesUnit = 'g';
    }

    // Extract sugar
    const sugarMatch = nutritionInfo.match(COMPOSE_NUTRITION_PATTERNS.sugar);
    if (sugarMatch) {
      nutrition.sugar = Number.parseFloat(sugarMatch[1]);
      nutrition.sugarUnit = 'g';
    }

    // Extract fat
    const fatMatch = nutritionInfo.match(COMPOSE_NUTRITION_PATTERNS.fat);
    if (fatMatch) {
      nutrition.fat = Number.parseFloat(fatMatch[1]);
      nutrition.fatUnit = 'g';
    }

    // Extract saturated fat
    const saturatedFatMatch = nutritionInfo.match(
      COMPOSE_NUTRITION_PATTERNS.saturatedFat
    );
    if (saturatedFatMatch) {
      nutrition.saturatedFat = Number.parseFloat(saturatedFatMatch[1]);
      nutrition.saturatedFatUnit = 'g';
    }

    // Extract protein
    const proteinMatch = nutritionInfo.match(
      COMPOSE_NUTRITION_PATTERNS.protein
    );
    if (proteinMatch) {
      nutrition.protein = Number.parseFloat(proteinMatch[1]);
      nutrition.proteinUnit = 'g';
    }

    return Object.keys(nutrition).length > 0 ? nutrition : null;
  } catch {
    return null;
  }
}

// ================================================
// CATEGORY EXTRACTION
// ================================================

export async function extractComposeCategories(
  page: Page,
  context: ExtractorContext
): Promise<Array<{ name: string; url: string; id?: string }>> {
  const categories: Array<{ name: string; url: string; id?: string }> = [];

  try {
    const categoryLinks = page.locator(COMPOSE_SELECTORS.categoryLinks);
    const linkCount = await categoryLinks.count();

    for (let i = 0; i < linkCount; i++) {
      const link = categoryLinks.nth(i);
      const [href, text] = await Promise.all([
        link.getAttribute('href'),
        link.textContent().then((t) => t?.trim() || ''),
      ]);

      if (href && text) {
        const match = href.match(CATEGORY_ID_PATTERN);
        if (match) {
          categories.push({
            url: href.startsWith('/') ? `${context.baseUrl}${href}` : href,
            name: text,
            id: match[1],
          });
        }
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

export async function extractComposeProduct(
  container: Locator,
  context: ExtractorContext
): Promise<{
  name: string;
  nameEn: string | null;
  description: string | null;
  imageUrl: string;
  price: number | null;
  externalId?: string;
} | null> {
  try {
    const [productId, name, imageUrl] = await Promise.all([
      container
        .locator(COMPOSE_SELECTORS.productData.id)
        .getAttribute('id')
        .then((id) => id || ''),
      container
        .locator(COMPOSE_SELECTORS.productData.name)
        .textContent()
        .then((text) => text?.trim() || ''),
      container
        .locator(COMPOSE_SELECTORS.productData.image)
        .getAttribute('src')
        .then((src) => {
          let url = src || '';
          if (url.startsWith('/')) {
            url = `${context.baseUrl}${url}`;
          }
          return url;
        }),
    ]);

    if (name && name.length > 0) {
      return {
        name,
        nameEn: null,
        description: null,
        imageUrl,
        price: null,
        externalId: productId ? `compose_${productId}` : undefined,
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

export const composeDefinition = defineCrawler({
  config: {
    brand: COMPOSE_CONFIG.brand,
    baseUrl: COMPOSE_CONFIG.baseUrl,
    startUrl: COMPOSE_CONFIG.startUrl,
  },
  selectors: {
    productContainers: COMPOSE_SELECTORS.productContainers,
    productData: COMPOSE_SELECTORS.productData,
    categoryLinks: COMPOSE_SELECTORS.categoryLinks,
    nutrition: COMPOSE_SELECTORS.nutrition,
    pagination: COMPOSE_SELECTORS.pagination,
  },
  strategy: 'inline-data',
  pagination: 'page-numbers',
  options: {
    maxConcurrency: 3,
    maxRequestsPerCrawl: 100,
    maxRequestRetries: 2,
    requestHandlerTimeoutSecs: 60,
  },
  extractProduct: extractComposeProduct,
  extractNutrition: extractComposeNutrition,
  extractCategories: extractComposeCategories,
});
