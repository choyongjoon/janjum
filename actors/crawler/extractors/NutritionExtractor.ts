import type { Locator, Page } from 'playwright';
import { logger } from '../../../shared/logger';
import type { Nutritions } from '../../../shared/nutritions';
import type { ExtractorContext } from '../core/types';
import {
  extractNutritionFromText,
  hasNutritionKeywords,
  parseNutritionValueFromText,
} from '../nutritionUtils';

// ================================================
// NUTRITION EXTRACTOR TYPES
// ================================================

export interface NutritionSelectorConfig {
  /** Main container selector */
  container?: string;
  /** Individual nutrition item selector */
  items?: string;
  /** Label selector within item */
  label?: string;
  /** Value selector within item */
  value?: string;
  /** Serving size selector */
  servingSize?: string;
}

export interface NutritionLabelMapping {
  calories?: string[];
  protein?: string[];
  fat?: string[];
  saturatedFat?: string[];
  transFat?: string[];
  carbohydrates?: string[];
  sugar?: string[];
  sodium?: string[];
  cholesterol?: string[];
  caffeine?: string[];
  servingSize?: string[];
}

// Default Korean nutrition label mappings
export const DEFAULT_KOREAN_LABELS: NutritionLabelMapping = {
  calories: ['열량', '칼로리', 'kcal'],
  protein: ['단백질'],
  fat: ['지방'],
  saturatedFat: ['포화지방', '포화 지방'],
  transFat: ['트랜스지방', '트랜스 지방'],
  carbohydrates: ['탄수화물'],
  sugar: ['당류', '당'],
  sodium: ['나트륨'],
  cholesterol: ['콜레스테롤'],
  caffeine: ['카페인'],
  servingSize: ['1회 제공량', '용량', '내용량'],
};

// ================================================
// UTILITY FUNCTIONS
// ================================================

/**
 * Parse a numeric value from text
 */
export function parseNumericValue(text: string | null): number | null {
  return parseNutritionValueFromText(text);
}

/**
 * Check if text contains nutrition keywords
 */
export function containsNutritionKeywords(text: string): boolean {
  return hasNutritionKeywords(text);
}

/**
 * Extract nutrition from raw text using regex patterns
 */
export function extractFromText(text: string): Nutritions | null {
  return extractNutritionFromText(text);
}

// ================================================
// STRUCTURED EXTRACTION
// ================================================

/**
 * Map a label to a nutrition field
 */
function mapLabelToField(
  label: string,
  mapping: NutritionLabelMapping
): keyof Nutritions | null {
  const normalizedLabel = label.toLowerCase().trim();

  for (const [field, keywords] of Object.entries(mapping)) {
    if (
      keywords?.some((keyword) =>
        normalizedLabel.includes(keyword.toLowerCase())
      )
    ) {
      return field as keyof Nutritions;
    }
  }

  return null;
}

/**
 * Get the unit for a nutrition field
 */
function getUnitForField(field: keyof Nutritions): {
  valueField: keyof Nutritions;
  unitField: keyof Nutritions;
  unit: string;
} | null {
  const fieldUnits: Record<
    string,
    { valueField: keyof Nutritions; unitField: keyof Nutritions; unit: string }
  > = {
    calories: {
      valueField: 'calories',
      unitField: 'caloriesUnit',
      unit: 'kcal',
    },
    protein: { valueField: 'protein', unitField: 'proteinUnit', unit: 'g' },
    fat: { valueField: 'fat', unitField: 'fatUnit', unit: 'g' },
    saturatedFat: {
      valueField: 'saturatedFat',
      unitField: 'saturatedFatUnit',
      unit: 'g',
    },
    transFat: { valueField: 'transFat', unitField: 'transFatUnit', unit: 'g' },
    carbohydrates: {
      valueField: 'carbohydrates',
      unitField: 'carbohydratesUnit',
      unit: 'g',
    },
    sugar: { valueField: 'sugar', unitField: 'sugarUnit', unit: 'g' },
    sodium: { valueField: 'natrium', unitField: 'natriumUnit', unit: 'mg' },
    cholesterol: {
      valueField: 'cholesterol',
      unitField: 'cholesterolUnit',
      unit: 'mg',
    },
    caffeine: { valueField: 'caffeine', unitField: 'caffeineUnit', unit: 'mg' },
    servingSize: {
      valueField: 'servingSize',
      unitField: 'servingSizeUnit',
      unit: 'ml',
    },
  };

  return fieldUnits[field] || null;
}

/**
 * Extract nutrition from structured DL/DT/DD elements
 */
export async function extractFromDlElements(
  container: Locator,
  options: {
    dlSelector?: string;
    labelMapping?: NutritionLabelMapping;
  } = {}
): Promise<Nutritions | null> {
  const { dlSelector = 'dl', labelMapping = DEFAULT_KOREAN_LABELS } = options;

  try {
    const dlElements = container.locator(dlSelector);
    const count = await dlElements.count();

    if (count === 0) {
      return null;
    }

    const nutrition: Nutritions = {};

    for (let i = 0; i < count; i++) {
      const dl = dlElements.nth(i);
      const dt = await dl
        .locator('dt')
        .textContent()
        .catch(() => '');
      const dd = await dl
        .locator('dd')
        .textContent()
        .catch(() => '');

      if (!(dt && dd)) {
        continue;
      }

      const field = mapLabelToField(dt, labelMapping);
      if (!field) {
        continue;
      }

      const value = parseNumericValue(dd);
      if (value === null) {
        continue;
      }

      const unitInfo = getUnitForField(field);
      if (unitInfo) {
        (nutrition as Record<string, unknown>)[unitInfo.valueField] = value;
        (nutrition as Record<string, unknown>)[unitInfo.unitField] =
          unitInfo.unit;
      }
    }

    return Object.keys(nutrition).length > 0 ? nutrition : null;
  } catch (error) {
    logger.debug(`Failed to extract nutrition from DL elements: ${error}`);
    return null;
  }
}

/**
 * Extract nutrition from table elements
 */
export async function extractFromTable(
  container: Locator,
  options: {
    tableSelector?: string;
    headerRow?: number;
    dataRow?: number;
    labelMapping?: NutritionLabelMapping;
  } = {}
): Promise<Nutritions | null> {
  const {
    tableSelector = 'table',
    headerRow = 0,
    dataRow = 1,
    labelMapping = DEFAULT_KOREAN_LABELS,
  } = options;

  try {
    const table = container.locator(tableSelector).first();
    const rows = await table.locator('tr').all();

    if (rows.length <= dataRow) {
      return null;
    }

    // Get headers
    const headerCells = await rows[headerRow].locator('th, td').all();
    const headers: string[] = [];
    for (const cell of headerCells) {
      headers.push((await cell.textContent())?.trim() || '');
    }

    // Get values
    const dataCells = await rows[dataRow].locator('td').all();
    const values: string[] = [];
    for (const cell of dataCells) {
      values.push((await cell.textContent())?.trim() || '');
    }

    const nutrition: Nutritions = {};

    for (let i = 0; i < headers.length && i < values.length; i++) {
      const field = mapLabelToField(headers[i], labelMapping);
      if (!field) {
        continue;
      }

      const value = parseNumericValue(values[i]);
      if (value === null) {
        continue;
      }

      const unitInfo = getUnitForField(field);
      if (unitInfo) {
        (nutrition as Record<string, unknown>)[unitInfo.valueField] = value;
        (nutrition as Record<string, unknown>)[unitInfo.unitField] =
          unitInfo.unit;
      }
    }

    return Object.keys(nutrition).length > 0 ? nutrition : null;
  } catch (error) {
    logger.debug(`Failed to extract nutrition from table: ${error}`);
    return null;
  }
}

// ================================================
// MAIN EXTRACTOR FACTORY
// ================================================

export interface NutritionExtractorOptions {
  /** Extraction method */
  method: 'text' | 'dl' | 'table' | 'custom';
  /** Selector for nutrition container */
  selector?: string;
  /** Label mapping for structured extraction */
  labelMapping?: NutritionLabelMapping;
  /** Custom extraction function */
  customExtractor?: (
    element: Locator | Page,
    context: ExtractorContext
  ) => Promise<Nutritions | null>;
}

/**
 * Create a nutrition extractor function based on options
 */
export function createNutritionExtractor(
  options: NutritionExtractorOptions
): (
  element: Locator | Page,
  context: ExtractorContext
) => Promise<Nutritions | null> {
  return async (element: Locator | Page, context: ExtractorContext) => {
    try {
      // Use custom extractor if provided
      if (options.method === 'custom' && options.customExtractor) {
        return options.customExtractor(element, context);
      }

      // Get the container element
      let container: Locator;
      if ('locator' in element) {
        // It's a Page
        container = options.selector
          ? element.locator(options.selector)
          : element.locator('body');
      } else {
        // It's already a Locator
        container = options.selector
          ? element.locator(options.selector)
          : element;
      }

      const count = await container.count();
      if (count === 0) {
        return null;
      }

      switch (options.method) {
        case 'text': {
          const text = await container.textContent().catch(() => '');
          return text ? extractFromText(text) : null;
        }
        case 'dl':
          return extractFromDlElements(container, {
            labelMapping: options.labelMapping,
          });
        case 'table':
          return extractFromTable(container, {
            labelMapping: options.labelMapping,
          });
        default:
          return null;
      }
    } catch (error) {
      logger.debug(`Nutrition extraction failed: ${error}`);
      return null;
    }
  };
}
