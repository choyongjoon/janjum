import type { Page } from 'playwright';
import { logger } from '../../../../shared/logger';
import type { Nutritions } from '../../../../shared/nutritions';
import { defineCrawler, type ExtractorContext } from '../../core';

// ================================================
// SITE CONFIGURATION
// ================================================

export const GONGCHA_CONFIG = {
  brand: 'gongcha',
  baseUrl: 'https://www.gong-cha.co.kr',
  startUrl: 'https://www.gong-cha.co.kr/brand/menu/product?category=001001',
} as const;

// ================================================
// PREDEFINED CATEGORIES
// ================================================

export const GONGCHA_CATEGORIES = [
  { code: '001001', name: 'New 시즌 메뉴', mainCategory: '음료' },
  { code: '001002', name: '베스트셀러', mainCategory: '음료' },
  { code: '001006', name: '밀크티', mainCategory: '음료' },
  { code: '001010', name: '스무디', mainCategory: '음료' },
  { code: '001003', name: '오리지널 티', mainCategory: '음료' },
  { code: '001015', name: '프룻티&모어', mainCategory: '음료' },
  { code: '001011', name: '커피', mainCategory: '음료' },
  { code: '002001', name: '베이커리', mainCategory: '푸드' },
  { code: '002004', name: '스낵', mainCategory: '푸드' },
  { code: '002006', name: '아이스크림', mainCategory: '푸드' },
  { code: '003001', name: '비식품', mainCategory: 'MD상품' },
  { code: '003002', name: '식품', mainCategory: 'MD상품' },
] as const;

// ================================================
// SELECTORS
// ================================================

export const GONGCHA_SELECTORS = {
  productContainers: 'li:has(a[href*="detail"])',
  productData: {
    name: '',
    image: 'img',
    link: 'a[href*="detail"]',
  },
  categoryTabs: '.tabWrap ul li.active a',
  nutrition: '.table-list table',
} as const;

// ================================================
// REGEX PATTERNS
// ================================================

const FILE_EXTENSION_REGEX = /\.[^.]*$/;
const DECIMAL_NUMERIC_REGEX = /^\d*\.?\d+$/;
const UNIT_EXTRACTION_REGEX = /\(([^)]+)\)/;

// ================================================
// NUTRITION EXTRACTION
// ================================================

export async function extractGongchaNutrition(
  page: Page,
  _context: ExtractorContext
): Promise<Nutritions | null> {
  try {
    const nutritionTable = page.locator('.table-list table');

    if ((await nutritionTable.count()) === 0) {
      logger.warn('No nutrition table found on page');
      return null;
    }

    // Extract both headers and values using batch evaluation
    const nutritionData = await page.evaluate(() => {
      const table = document.querySelector('.table-list table');
      if (!table) {
        return { tableHeaders: [], tableRows: [] };
      }

      const headerCells = table.querySelectorAll('thead tr th');
      const tableHeaders = Array.from(headerCells).map(
        (cell) => cell.textContent?.trim().replace(/\s+/g, ' ') || ''
      );

      const bodyRows = table.querySelectorAll('tbody tr');
      const tableRows = Array.from(bodyRows).map((row) => {
        const cells = row.querySelectorAll('td');
        return Array.from(cells).map((cell) => cell.textContent?.trim() || '');
      });

      return { tableHeaders, tableRows };
    });

    const { tableHeaders: headers, tableRows: allRows } = nutritionData;

    if (headers.length === 0 || allRows.length === 0) {
      return null;
    }

    // Find best row with most complete nutrition data
    let bestNutritionMap = new Map<string, string>();
    let bestScore = 0;

    for (const row of allRows) {
      if (row.length === 0) {
        continue;
      }

      // Find where numeric data starts
      let dataStartIndex = 0;
      for (let i = 0; i < row.length; i++) {
        if (DECIMAL_NUMERIC_REGEX.test(row[i])) {
          dataStartIndex = i;
          break;
        }
      }

      // Create mapping from headers to values
      const rowMap = new Map<string, string>();
      let headerIndex = 1;
      for (
        let i = dataStartIndex;
        i < row.length && headerIndex < headers.length;
        i++, headerIndex++
      ) {
        rowMap.set(headers[headerIndex], row[i]);
      }

      // Score this row
      let score = 0;
      for (const value of rowMap.values()) {
        if (DECIMAL_NUMERIC_REGEX.test(value)) {
          score++;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestNutritionMap = rowMap;
      }
    }

    if (bestNutritionMap.size === 0) {
      return null;
    }

    // Parse values helper
    const parseValue = (text: string | null): number | null => {
      if (!text || text.trim() === '' || text.trim() === '-') {
        return null;
      }
      const parsed = Number.parseFloat(text.trim());
      return Number.isNaN(parsed) ? null : parsed;
    };

    // Extract serving size
    let servingSizeText = '';
    let servingSizeUnit = '';
    const servingSizeHeaders = [
      '1회 제공량(g)',
      '1회 제공량 (g)',
      '1회 제공량(ml)',
      '1회 제공량 (ml)',
    ];

    for (const header of servingSizeHeaders) {
      if (bestNutritionMap.has(header)) {
        servingSizeText = bestNutritionMap.get(header) || '';
        const unitMatch = header.match(UNIT_EXTRACTION_REGEX);
        servingSizeUnit = unitMatch ? unitMatch[1] : 'g';
        break;
      }
    }

    // Extract nutrition values
    const getValue = (...headers: string[]) => {
      for (const h of headers) {
        const val = bestNutritionMap.get(h);
        if (val) {
          return val;
        }
      }
      return '';
    };

    const servingSize = parseValue(servingSizeText);
    const calories = parseValue(getValue('열량(kcal)', '열량 (kcal)'));
    const sodium = parseValue(getValue('나트륨(mg)', '나트륨 (mg)'));
    const sugar = parseValue(getValue('당류(g)', '당류 (g)'));
    const saturatedFat = parseValue(getValue('포화지방(g)', '포화지방 (g)'));
    const protein = parseValue(getValue('단백질(g)', '단백질 (g)'));
    const caffeine = parseValue(getValue('카페인(mg)', '카페인 (mg)'));

    const nutritions: Nutritions = {
      servingSize: servingSize ?? undefined,
      servingSizeUnit: servingSize !== null ? servingSizeUnit : undefined,
      calories: calories ?? undefined,
      caloriesUnit: calories !== null ? 'kcal' : undefined,
      sugar: sugar ?? undefined,
      sugarUnit: sugar !== null ? 'g' : undefined,
      protein: protein ?? undefined,
      proteinUnit: protein !== null ? 'g' : undefined,
      saturatedFat: saturatedFat ?? undefined,
      saturatedFatUnit: saturatedFat !== null ? 'g' : undefined,
      natrium: sodium ?? undefined,
      natriumUnit: sodium !== null ? 'mg' : undefined,
      caffeine: caffeine ?? undefined,
      caffeineUnit: caffeine !== null ? 'mg' : undefined,
    };

    const hasData = Object.entries(nutritions).some(
      ([key, value]) => !key.endsWith('Unit') && value !== null
    );

    return hasData ? nutritions : null;
  } catch (error) {
    logger.error('Error extracting nutrition from Gongcha page:', error);
    return null;
  }
}

// ================================================
// CATEGORY EXTRACTION
// ================================================

export async function extractGongchaCategories(
  _page: Page,
  context: ExtractorContext
): Promise<Array<{ name: string; url: string; id?: string }>> {
  // Use predefined categories
  return GONGCHA_CATEGORIES.map((cat) => ({
    name: cat.name,
    url: `${context.baseUrl}/brand/menu/product?category=${cat.code}`,
    id: cat.code,
  }));
}

// ================================================
// HELPER FUNCTIONS
// ================================================

export function generateGongchaExternalId(imageSrc: string): string {
  if (imageSrc) {
    const idFromImage = imageSrc
      .split('/')
      .pop()
      ?.replace(FILE_EXTENSION_REGEX, '');
    if (idFromImage) {
      return idFromImage;
    }
  }
  return `gongcha_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// ================================================
// CRAWLER DEFINITION
// ================================================

export const gongchaDefinition = defineCrawler({
  config: {
    brand: GONGCHA_CONFIG.brand,
    baseUrl: GONGCHA_CONFIG.baseUrl,
    startUrl: GONGCHA_CONFIG.startUrl,
  },
  selectors: {
    productContainers: GONGCHA_SELECTORS.productContainers,
    productData: GONGCHA_SELECTORS.productData,
    nutrition: GONGCHA_SELECTORS.nutrition,
  },
  strategy: 'list-detail',
  pagination: 'none',
  options: {
    maxConcurrency: 3,
    maxRequestsPerCrawl: 150,
    maxRequestRetries: 1,
    requestHandlerTimeoutSecs: 90,
    launchOptions: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
      ],
    },
  },
  extractNutrition: extractGongchaNutrition,
  extractCategories: extractGongchaCategories,
});
