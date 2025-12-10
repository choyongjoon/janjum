import type { Locator, Page } from 'playwright';
import type { Nutritions } from '../../../../shared/nutritions';
import { defineCrawler, type ExtractorContext } from '../../core';

// ================================================
// SITE CONFIGURATION
// ================================================

export const COFFEEBEAN_CONFIG = {
  brand: 'coffeebean',
  baseUrl: 'https://www.coffeebeankorea.com',
  startUrl: 'https://www.coffeebeankorea.com/menu/list.asp?category=13',
} as const;

// ================================================
// SELECTORS
// ================================================

export const COFFEEBEAN_SELECTORS = {
  productContainers: '.menu_list > li',
  productData: {
    name: 'dl.txt > dt > span:nth-child(2)',
    nameEn: 'dl.txt > dt > span:nth-child(1)',
    description: 'dl.txt > dd',
    image: 'img',
  },
  categoryLinks: 'ul.lnb_wrap2 > li:nth-child(1) > ul:nth-child(2) li a',
  nutrition: '.info',
  pagination: {
    pageLinks: 'div.paging > a',
  },
} as const;

// ================================================
// NUTRITION EXTRACTION
// ================================================

export async function extractCoffeebeanNutrition(
  element: Locator,
  _context: ExtractorContext
): Promise<Nutritions | null> {
  try {
    const nutritionElement = element.locator('.info');

    if ((await nutritionElement.count()) === 0) {
      return null;
    }

    const dlElements = nutritionElement.locator('dl');
    const dlCount = await dlElements.count();

    if (dlCount === 0) {
      return null;
    }

    const nutritions: Partial<Nutritions> = {};

    for (let i = 0; i < dlCount; i++) {
      const dl = dlElements.nth(i);
      const dt = await dl.locator('dt').textContent();
      const dd = await dl.locator('dd').textContent();

      if (!(dt && dd)) {
        continue;
      }

      const value = Number.parseInt(dt.trim(), 10);
      if (Number.isNaN(value)) {
        continue;
      }

      const label = dd.replace(/\s+/g, ' ').trim().toLowerCase();

      if (label.includes('열량') || label.includes('kcal')) {
        nutritions.calories = value;
        nutritions.caloriesUnit = 'kcal';
      } else if (label.includes('나트륨') || label.includes('sodium')) {
        nutritions.natrium = value;
        nutritions.natriumUnit = 'mg';
      } else if (label.includes('탄수화물') || label.includes('carbohydrate')) {
        nutritions.carbohydrates = value;
        nutritions.carbohydratesUnit = 'g';
      } else if (label.includes('당') || label.includes('sugar')) {
        nutritions.sugar = value;
        nutritions.sugarUnit = 'g';
      } else if (label.includes('단백질') || label.includes('protein')) {
        nutritions.protein = value;
        nutritions.proteinUnit = 'g';
      } else if (label.includes('카페인') || label.includes('caffeine')) {
        nutritions.caffeine = value;
        nutritions.caffeineUnit = 'mg';
      } else if (label.includes('포화지방') || label.includes('saturated')) {
        nutritions.saturatedFat = value;
        nutritions.saturatedFatUnit = 'g';
      }
    }

    return Object.keys(nutritions).length > 0
      ? (nutritions as Nutritions)
      : null;
  } catch {
    return null;
  }
}

// ================================================
// CATEGORY EXTRACTION
// ================================================

export async function extractCoffeebeanCategories(
  page: Page,
  context: ExtractorContext
): Promise<Array<{ name: string; url: string }>> {
  const categories: Array<{ name: string; url: string }> = [];

  try {
    const categoryElements = await page
      .locator(COFFEEBEAN_SELECTORS.categoryLinks)
      .all();

    for (const element of categoryElements) {
      const [text, href] = await Promise.all([
        element.textContent(),
        element.getAttribute('href'),
      ]);

      if (text?.trim() && href) {
        const categoryName = text.trim();
        const fullUrl = href.startsWith('http')
          ? href
          : `${context.baseUrl}${href}`;

        categories.push({
          name: categoryName,
          url: fullUrl,
        });
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

export const coffeebeanDefinition = defineCrawler({
  config: {
    brand: COFFEEBEAN_CONFIG.brand,
    baseUrl: COFFEEBEAN_CONFIG.baseUrl,
    startUrl: COFFEEBEAN_CONFIG.startUrl,
  },
  selectors: {
    productContainers: COFFEEBEAN_SELECTORS.productContainers,
    productData: COFFEEBEAN_SELECTORS.productData,
    categoryLinks: COFFEEBEAN_SELECTORS.categoryLinks,
    nutrition: COFFEEBEAN_SELECTORS.nutrition,
    pagination: COFFEEBEAN_SELECTORS.pagination,
  },
  strategy: 'inline-data',
  pagination: 'page-numbers',
  options: {
    maxConcurrency: 2,
    maxRequestsPerCrawl: 50,
    maxRequestRetries: 2,
    requestHandlerTimeoutSecs: 60,
  },
  extractNutrition: extractCoffeebeanNutrition,
  extractCategories: extractCoffeebeanCategories,
});
