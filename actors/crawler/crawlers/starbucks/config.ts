import type { Page } from 'playwright';
import { logger } from '../../../../shared/logger';
import type { Nutritions } from '../../../../shared/nutritions';
import { defineCrawler, type ExtractorContext } from '../../core';
import { parseNumericValue } from '../../extractors';

// ================================================
// SITE CONFIGURATION
// ================================================

export const STARBUCKS_CONFIG = {
  brand: 'starbucks',
  baseUrl: 'https://www.starbucks.co.kr',
  startUrl: 'https://www.starbucks.co.kr/menu/drink_list.do',
  productUrlTemplate:
    'https://www.starbucks.co.kr/menu/drink_view.do?product_cd=',
} as const;

// ================================================
// SELECTORS
// ================================================

export const STARBUCKS_SELECTORS = {
  productContainers: [
    'a.goDrinkView',
    'a[href*="drink_view.do"]',
    'a[href*="product_cd"]',
  ],
  productData: {
    name: '.myAssignZone > h4',
    nameEn: '.myAssignZone > h4 > span',
    description: '.myAssignZone p.t1',
    image: '.elevatezoom-gallery > img:first-child',
    link: '', // Links extracted differently
  },
  nutrition: {
    servingSize: '#product_info01',
    calories: '.product_info_content li.kcal dd',
    protein: '.product_info_content li.protein dd',
    fat: '.product_info_content li.fat dd',
    saturatedFat: '.product_info_content li.sat_FAT dd',
    transFat: '.product_info_content li.trans_FAT dd',
    cholesterol: '.product_info_content li.cholesterol dd',
    sodium: '.product_info_content li.sodium dd',
    sugar: '.product_info_content li.sugars dd',
    carbohydrates: '.product_info_content li.chabo dd',
    caffeine: '.product_info_content li.caffeine dd',
  },
} as const;

// ================================================
// REGEX PATTERNS
// ================================================

const PATTERNS = {
  productCode: /\[(\d+)\]/,
  servingSize: /(\d+)ml/,
} as const;

// ================================================
// NUTRITION EXTRACTION
// ================================================

export async function extractStarbucksNutrition(
  page: Page,
  _context: ExtractorContext
): Promise<Nutritions | null> {
  try {
    // Wait for nutrition content to load
    await page.waitForTimeout(1500);

    // Check if nutrition data is available
    const hasNutritionInfo =
      (await page.locator('#product_info01').count()) > 0;
    if (!hasNutritionInfo) {
      return null;
    }

    // Extract serving size
    const servingText = await page
      .locator(STARBUCKS_SELECTORS.nutrition.servingSize)
      .textContent()
      .catch(() => '');

    let servingSize: number | undefined;
    if (servingText) {
      const match = servingText.match(PATTERNS.servingSize);
      if (match) {
        servingSize = Number.parseInt(match[1], 10);
      }
    }

    // Extract nutrition values in parallel
    const [
      calories,
      protein,
      fat,
      saturatedFat,
      transFat,
      cholesterol,
      sodium,
      sugar,
      carbohydrates,
      caffeine,
    ] = await Promise.all([
      page
        .locator(STARBUCKS_SELECTORS.nutrition.calories)
        .textContent()
        .catch(() => ''),
      page
        .locator(STARBUCKS_SELECTORS.nutrition.protein)
        .textContent()
        .catch(() => ''),
      page
        .locator(STARBUCKS_SELECTORS.nutrition.fat)
        .textContent()
        .catch(() => ''),
      page
        .locator(STARBUCKS_SELECTORS.nutrition.saturatedFat)
        .textContent()
        .catch(() => ''),
      page
        .locator(STARBUCKS_SELECTORS.nutrition.transFat)
        .textContent()
        .catch(() => ''),
      page
        .locator(STARBUCKS_SELECTORS.nutrition.cholesterol)
        .textContent()
        .catch(() => ''),
      page
        .locator(STARBUCKS_SELECTORS.nutrition.sodium)
        .textContent()
        .catch(() => ''),
      page
        .locator(STARBUCKS_SELECTORS.nutrition.sugar)
        .textContent()
        .catch(() => ''),
      page
        .locator(STARBUCKS_SELECTORS.nutrition.carbohydrates)
        .textContent()
        .catch(() => ''),
      page
        .locator(STARBUCKS_SELECTORS.nutrition.caffeine)
        .textContent()
        .catch(() => ''),
    ]);

    const nutritions: Nutritions = {
      servingSize,
      servingSizeUnit: servingSize !== undefined ? 'ml' : undefined,
      calories: parseNumericValue(calories) ?? undefined,
      caloriesUnit: parseNumericValue(calories) !== null ? 'kcal' : undefined,
      carbohydrates: parseNumericValue(carbohydrates) ?? undefined,
      carbohydratesUnit:
        parseNumericValue(carbohydrates) !== null ? 'g' : undefined,
      sugar: parseNumericValue(sugar) ?? undefined,
      sugarUnit: parseNumericValue(sugar) !== null ? 'g' : undefined,
      protein: parseNumericValue(protein) ?? undefined,
      proteinUnit: parseNumericValue(protein) !== null ? 'g' : undefined,
      fat: parseNumericValue(fat) ?? undefined,
      fatUnit: parseNumericValue(fat) !== null ? 'g' : undefined,
      transFat: parseNumericValue(transFat) ?? undefined,
      transFatUnit: parseNumericValue(transFat) !== null ? 'g' : undefined,
      saturatedFat: parseNumericValue(saturatedFat) ?? undefined,
      saturatedFatUnit:
        parseNumericValue(saturatedFat) !== null ? 'g' : undefined,
      natrium: parseNumericValue(sodium) ?? undefined,
      natriumUnit: parseNumericValue(sodium) !== null ? 'mg' : undefined,
      cholesterol: parseNumericValue(cholesterol) ?? undefined,
      cholesterolUnit:
        parseNumericValue(cholesterol) !== null ? 'mg' : undefined,
      caffeine: parseNumericValue(caffeine) ?? undefined,
      caffeineUnit: parseNumericValue(caffeine) !== null ? 'mg' : undefined,
    };

    // Check if any nutrition data was extracted
    const hasData = Object.entries(nutritions).some(
      ([key, value]) => !key.endsWith('Unit') && value !== undefined
    );

    return hasData ? nutritions : null;
  } catch (error) {
    logger.debug(`Failed to extract Starbucks nutrition: ${error}`);
    return null;
  }
}

// ================================================
// PRODUCT ID EXTRACTION
// ================================================

function extractProductIdFromLink(
  href: string,
  onclick: string,
  innerHTML: string
): string | null {
  // Try to extract product ID from href
  if (href?.includes('drink_view.do')) {
    const match = href.match(PATTERNS.productCode);
    if (match) {
      return match[1];
    }
  }

  // Try to extract product ID from onclick
  if (onclick?.includes('product_cd')) {
    const match = onclick.match(PATTERNS.productCode);
    if (match) {
      return match[1];
    }
  }

  // Extract product ID from image src in innerHTML
  if (innerHTML) {
    const match = innerHTML.match(PATTERNS.productCode);
    if (match) {
      return match[1];
    }
  }

  return null;
}

export async function extractStarbucksProductIds(
  page: Page
): Promise<string[]> {
  const ids: string[] = [];

  for (const selector of STARBUCKS_SELECTORS.productContainers) {
    const links = page.locator(selector);
    const count = await links.count();

    if (count > 0) {
      logger.info(`Found ${count} products using selector: ${selector}`);

      for (let i = 0; i < count; i++) {
        const link = links.nth(i);
        const [href, onclick, innerHTML] = await Promise.all([
          link.getAttribute('href').then((h) => h || ''),
          link.getAttribute('onclick').then((o) => o || ''),
          link.innerHTML().then((h) => h || ''),
        ]);

        const productId = extractProductIdFromLink(href, onclick, innerHTML);
        if (productId && !ids.includes(productId)) {
          ids.push(productId);
        }
      }

      break; // Found products, stop trying other selectors
    }
  }

  return ids;
}

// ================================================
// PRODUCT DATA EXTRACTION FROM DETAIL PAGE
// ================================================

export async function extractStarbucksProductData(
  page: Page,
  _context: ExtractorContext
): Promise<{
  name: string;
  nameEn: string | null;
  description: string | null;
  imageUrl: string;
}> {
  const [name, nameEn, description, imageUrl] = await Promise.all([
    page
      .locator(STARBUCKS_SELECTORS.productData.name)
      .textContent()
      .then((text) => text?.trim() || ''),
    page
      .locator(STARBUCKS_SELECTORS.productData.nameEn)
      .textContent()
      .then((text) => text?.trim() || ''),
    page
      .locator(STARBUCKS_SELECTORS.productData.description)
      .first()
      .textContent()
      .then((text) => text?.trim() || ''),
    page
      .locator(STARBUCKS_SELECTORS.productData.image)
      .first()
      .getAttribute('src')
      .catch(() => '')
      .then((src) => src || ''),
  ]);

  // Clean Korean name by removing English part
  let cleanName = name;
  if (nameEn && name.includes(nameEn)) {
    cleanName = name.replace(nameEn, '').trim();
  }

  return {
    name: cleanName,
    nameEn,
    description,
    imageUrl,
  };
}

// ================================================
// CRAWLER DEFINITION
// ================================================

export const starbucksDefinition = defineCrawler({
  config: {
    brand: STARBUCKS_CONFIG.brand,
    baseUrl: STARBUCKS_CONFIG.baseUrl,
    startUrl: STARBUCKS_CONFIG.startUrl,
    productUrlTemplate: STARBUCKS_CONFIG.productUrlTemplate,
  },
  selectors: {
    productContainers: STARBUCKS_SELECTORS.productContainers,
    productData: STARBUCKS_SELECTORS.productData,
  },
  strategy: 'list-detail',
  pagination: 'none',
  options: {
    maxConcurrency: 10,
    maxRequestsPerCrawl: 300,
    maxRequestRetries: 1,
    requestHandlerTimeoutSecs: 25,
    launchOptions: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--no-zygote',
        '--single-process',
      ],
    },
  },
  extractNutrition: extractStarbucksNutrition,
});
