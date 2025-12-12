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
// NUTRITION EXTRACTION HELPERS
// ================================================

interface NutritionTableData {
  tableHeaders: string[];
  tableRows: string[][];
}

function parseNutritionValue(text: string | null): number | null {
  if (!text || text.trim() === '' || text.trim() === '-') {
    return null;
  }
  const parsed = Number.parseFloat(text.trim());
  return Number.isNaN(parsed) ? null : parsed;
}

function findDataStartIndex(row: string[]): number {
  for (let i = 0; i < row.length; i++) {
    if (DECIMAL_NUMERIC_REGEX.test(row[i])) {
      return i;
    }
  }
  return 0;
}

function createRowMapping(
  row: string[],
  headers: string[]
): Map<string, string> {
  const dataStartIndex = findDataStartIndex(row);
  const rowMap = new Map<string, string>();
  let headerIndex = 1;

  for (
    let i = dataStartIndex;
    i < row.length && headerIndex < headers.length;
    i++, headerIndex++
  ) {
    rowMap.set(headers[headerIndex], row[i]);
  }
  return rowMap;
}

function scoreRowMap(rowMap: Map<string, string>): number {
  let score = 0;
  for (const value of rowMap.values()) {
    if (DECIMAL_NUMERIC_REGEX.test(value)) {
      score++;
    }
  }
  return score;
}

function findBestNutritionRow(
  allRows: string[][],
  headers: string[]
): Map<string, string> {
  let bestMap = new Map<string, string>();
  let bestScore = 0;

  for (const row of allRows) {
    if (row.length === 0) {
      continue;
    }
    const rowMap = createRowMapping(row, headers);
    const score = scoreRowMap(rowMap);

    if (score > bestScore) {
      bestScore = score;
      bestMap = rowMap;
    }
  }
  return bestMap;
}

function extractServingSize(nutritionMap: Map<string, string>): {
  text: string;
  unit: string;
} {
  const headers = [
    '1회 제공량(g)',
    '1회 제공량 (g)',
    '1회 제공량(ml)',
    '1회 제공량 (ml)',
  ];

  for (const header of headers) {
    if (nutritionMap.has(header)) {
      const unitMatch = header.match(UNIT_EXTRACTION_REGEX);
      return {
        text: nutritionMap.get(header) || '',
        unit: unitMatch ? unitMatch[1] : 'g',
      };
    }
  }
  return { text: '', unit: 'g' };
}

function getMapValue(map: Map<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const val = map.get(key);
    if (val) {
      return val;
    }
  }
  return '';
}

function buildNutritions(nutritionMap: Map<string, string>): Nutritions {
  const { text: servingSizeText, unit: servingSizeUnit } =
    extractServingSize(nutritionMap);

  const servingSize = parseNutritionValue(servingSizeText);
  const calories = parseNutritionValue(
    getMapValue(nutritionMap, '열량(kcal)', '열량 (kcal)')
  );
  const sodium = parseNutritionValue(
    getMapValue(nutritionMap, '나트륨(mg)', '나트륨 (mg)')
  );
  const sugar = parseNutritionValue(
    getMapValue(nutritionMap, '당류(g)', '당류 (g)')
  );
  const saturatedFat = parseNutritionValue(
    getMapValue(nutritionMap, '포화지방(g)', '포화지방 (g)')
  );
  const protein = parseNutritionValue(
    getMapValue(nutritionMap, '단백질(g)', '단백질 (g)')
  );
  const caffeine = parseNutritionValue(
    getMapValue(nutritionMap, '카페인(mg)', '카페인 (mg)')
  );

  return {
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
}

async function fetchNutritionTableData(
  page: Page
): Promise<NutritionTableData> {
  return await page.evaluate(() => {
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
}

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

    const { tableHeaders: headers, tableRows: allRows } =
      await fetchNutritionTableData(page);

    if (headers.length === 0 || allRows.length === 0) {
      return null;
    }

    const bestNutritionMap = findBestNutritionRow(allRows, headers);

    if (bestNutritionMap.size === 0) {
      return null;
    }

    const nutritions = buildNutritions(bestNutritionMap);

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

export function extractGongchaCategories(
  _page: Page,
  context: ExtractorContext
): Array<{ name: string; url: string; id?: string }> {
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
