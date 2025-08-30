import { PlaywrightCrawler } from 'crawlee';
import type { Page } from 'playwright';
import { logger } from '../../shared/logger';
import type { Nutritions } from '../../shared/nutritions';
import {
  type Product,
  takeDebugScreenshot,
  waitForLoad,
  writeProductsToJson,
} from './crawlerUtils';
import { extractNutritionFromText } from './nutritionUtils';

// ================================================
// SITE STRUCTURE CONFIGURATION
// ================================================

const SITE_CONFIG = {
  baseUrl: 'https://mmthcoffee.com',
  startUrl: 'https://mmthcoffee.com/sub/menu/list_coffee.php', // Use the coffee-specific URL
  menuListUrls: [
    'https://mmthcoffee.com/sub/menu/list_coffee.php',
    'https://mmthcoffee.com/sub/menu/list_sub.php?menuType=F', // Food/Dessert
  ],
  productUrlTemplate:
    'https://mmthcoffee.com/sub/menu/list_coffee_view.php?menuSeq=',
} as const;

// ================================================
// CSS SELECTORS
// ================================================

const SELECTORS = {
  // Product item selectors - simplified based on research
  productItems: 'ul li a[href*="goViewB"]',

  // Product data extraction
  productData: {
    koreanName: 'strong',
    image: 'img',
    link: '', // The entire anchor element
  },

  // Product detail page selectors
  productDetails: {
    name: '.product-title, h1, .detail-name',
    description: '.product-description, .detail-desc',
    category: '.product-category, .detail-category',
    image: '.product-image img, .detail-image img',
    price: '.price, .product-price',
    nutritionTable: '.i_table',
  },
} as const;

// ================================================
// CRAWLER CONFIGURATION
// ================================================

// Test mode configuration
const isTestMode = process.env.CRAWLER_TEST_MODE === 'true';
const maxProductsInTestMode = isTestMode
  ? Number.parseInt(process.env.CRAWLER_MAX_PRODUCTS || '3', 10)
  : Number.POSITIVE_INFINITY;
const maxRequestsInTestMode = isTestMode
  ? Number.parseInt(process.env.CRAWLER_MAX_REQUESTS || '10', 10)
  : 150;

const CRAWLER_CONFIG = {
  maxConcurrency: 4,
  maxRequestsPerCrawl: isTestMode ? maxRequestsInTestMode : 150,
  maxRequestRetries: 2,
  requestHandlerTimeoutSecs: isTestMode ? 20 : 30,
  launchOptions: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
};

// ================================================
// DATA EXTRACTION FUNCTIONS
// ================================================

const menuSeqRegex = /goViewB\(['""]?(\d+)['""]?\)/;

// Regex patterns for Mammoth nutrition extraction
const MAMMOTH_NUTRITION_PATTERNS = {
  servingSize: /ICE\((\d+)oz\)/i,
  calories: /칼로리\s*\([^)]*\)\s*([0-9.]+)/i,
  protein: /단백질\s*\([^)]*\)\s*([0-9.]+)/i,
  sugar: /당류\s*\([^)]*\)\s*([0-9.]+)/i,
  sodium: /나트륨\s*\([^)]*\)\s*([0-9.]+)/i,
  caffeine: /카페인\s*\([^)]*\)\s*([0-9.]+)/i,
} as const;

function extractMenuSeqFromHref(href: string): string | null {
  const match = href.match(menuSeqRegex);
  return match ? match[1] : null;
}

function extractMammothNutritionFromText(text: string): Nutritions | null {
  try {
    const nutrition: Nutritions = {};

    // Mammoth-specific patterns for Korean nutrition labels with parentheses format
    // Format: "Korean Label (Unit) Value"

    // Extract serving size from ICE(32oz) format
    const servingSizeMatch = text.match(MAMMOTH_NUTRITION_PATTERNS.servingSize);
    if (servingSizeMatch) {
      const ozValue = Number.parseFloat(servingSizeMatch[1]);
      // Convert oz to ml (1 oz = 29.5735 ml)
      nutrition.servingSize = Math.round(ozValue * 29.5735);
      nutrition.servingSizeUnit = 'ml';
    }

    // Extract calories: 칼로리 (Kcal) 30.2
    const caloriesMatch = text.match(MAMMOTH_NUTRITION_PATTERNS.calories);
    if (caloriesMatch) {
      nutrition.calories = Number.parseFloat(caloriesMatch[1]);
      nutrition.caloriesUnit = 'kcal';
    }

    // Extract protein: 단백질 (g) 1.9
    const proteinMatch = text.match(MAMMOTH_NUTRITION_PATTERNS.protein);
    if (proteinMatch) {
      nutrition.protein = Number.parseFloat(proteinMatch[1]);
      nutrition.proteinUnit = 'g';
    }

    // Extract sugar: 당류 (g) 73.5
    const sugarMatch = text.match(MAMMOTH_NUTRITION_PATTERNS.sugar);
    if (sugarMatch) {
      nutrition.sugar = Number.parseFloat(sugarMatch[1]);
      nutrition.sugarUnit = 'g';
    }

    // Extract sodium: 나트륨 (mg) 2.0
    const sodiumMatch = text.match(MAMMOTH_NUTRITION_PATTERNS.sodium);
    if (sodiumMatch) {
      nutrition.natrium = Number.parseFloat(sodiumMatch[1]);
      nutrition.natriumUnit = 'mg';
    }

    // Extract caffeine: 카페인 (mg) 486.5
    const caffeineMatch = text.match(MAMMOTH_NUTRITION_PATTERNS.caffeine);
    if (caffeineMatch) {
      nutrition.caffeine = Number.parseFloat(caffeineMatch[1]);
      nutrition.caffeineUnit = 'mg';
    }

    // Return null if no nutrition data was found
    const hasData = Object.keys(nutrition).length > 0;
    return hasData ? nutrition : null;
  } catch (error) {
    logger.debug('Error parsing Mammoth nutrition text:', error);
    return null;
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: optimize later
async function extractNutritionData(page: Page): Promise<Nutritions | null> {
  try {
    const nutritionTableElement = page.locator(
      SELECTORS.productDetails.nutritionTable
    );
    const nutritionTableCount = await nutritionTableElement.count();

    if (nutritionTableCount > 0) {
      logger.debug('Found .i_table selector, extracting nutrition data');

      // Try extracting from individual table cells for Mammoth's specific format
      const tableCells = await nutritionTableElement.locator('td, th').all();

      let combinedText = '';
      for (const tableCell of tableCells) {
        const cellText = await tableCell.textContent().catch(() => '');
        if (cellText?.trim()) {
          combinedText += `${cellText} `;
        }
      }

      if (combinedText) {
        logger.debug(
          `Combined cell text: ${combinedText.substring(0, 200)}...`
        );
        const nutrition = extractMammothNutritionFromText(combinedText);
        if (nutrition) {
          logger.debug('Successfully extracted nutrition data from .i_table');
          return nutrition;
        }
      }

      // Fallback to standard extraction
      const allTableText = await nutritionTableElement
        .textContent()
        .catch(() => '');
      if (allTableText) {
        const nutrition = extractNutritionFromText(allTableText);
        if (nutrition) {
          logger.debug(
            'Successfully extracted nutrition data from full table text'
          );
          return nutrition;
        }
      }
    } else {
      logger.debug('No .i_table selector found on page');
    }
    return null;
  } catch (error) {
    logger.debug(
      'Failed to extract nutrition data from Mammoth product:',
      error
    );
    return null;
  }
}

// ================================================
// PAGE HANDLERS
// ================================================

async function handleProductPage(
  page: Page,
  request: {
    userData: {
      basicInfo: {
        name: string;
        nameEn?: string;
        menuSeq: string;
        imageUrl?: string;
      };
    };
  },
  crawlerInstance: PlaywrightCrawler
) {
  const { basicInfo } = request.userData;

  logger.info(`🔗 Processing product: ${basicInfo.name}`);

  try {
    await waitForLoad(page);

    // Extract nutrition data from the product detail page
    const nutritions = await extractNutritionData(page);

    const product: Product = {
      name: basicInfo.name,
      nameEn: basicInfo.nameEn || '',
      description: '',
      externalCategory: 'Coffee',
      externalId: basicInfo.menuSeq,
      externalImageUrl: basicInfo.imageUrl || '',
      externalUrl: `${SITE_CONFIG.productUrlTemplate}${basicInfo.menuSeq}`,
      price: null,
      category: 'Coffee',
      nutritions,
    };

    await crawlerInstance.pushData(product);

    const nutritionInfo = nutritions ? ' with nutrition data' : '';
    logger.info(
      `✅ Extracted: ${product.name}${product.nameEn ? ` (${product.nameEn})` : ''}${nutritionInfo}`
    );
  } catch (error) {
    logger.warn(`Failed to process product ${basicInfo.name}: ${error}`);
  }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: optimize later
async function handleMenuListPage(
  page: Page,
  crawlerInstance: PlaywrightCrawler
) {
  logger.info('Processing Mammoth Coffee menu list page');

  await waitForLoad(page);
  await takeDebugScreenshot(page, 'mammoth-menu-list');

  // Extract product URLs from the list page
  try {
    const productLinks = await page.locator(SELECTORS.productItems).all();
    logger.info(`Found ${productLinks.length} product links on the page`);

    const productUrls: Array<{
      name: string;
      nameEn: string;
      menuSeq: string;
      imageUrl: string;
    }> = [];

    for (const link of productLinks) {
      try {
        // Extract href and menuSeq
        const href = await link.getAttribute('href').catch(() => '');
        const menuSeq = extractMenuSeqFromHref(href || '');

        if (!menuSeq) {
          continue;
        }

        // Extract Korean name from strong tag
        const koreanName = await link
          .locator('strong')
          .textContent()
          .catch(() => '');

        // Extract full text and get English name by removing Korean name
        const fullText = await link.textContent().catch(() => '');
        const englishName = fullText?.replace(koreanName || '', '').trim();

        // Extract image
        const imageSrc = await link
          .locator('img')
          .getAttribute('src')
          .catch(() => '');

        if (koreanName) {
          productUrls.push({
            name: koreanName,
            nameEn: englishName || '',
            menuSeq,
            imageUrl: imageSrc
              ? new URL(imageSrc, SITE_CONFIG.baseUrl).href
              : '',
          });
        }
      } catch (error) {
        logger.warn(`Error processing product link: ${error}`);
      }
    }

    // Limit products in test mode
    const productsToProcess = isTestMode
      ? productUrls.slice(0, maxProductsInTestMode)
      : productUrls;

    if (isTestMode) {
      logger.info(
        `🧪 Test mode: limiting to ${productsToProcess.length} products`
      );
    }

    // Enqueue product detail pages for processing
    for (const basicInfo of productsToProcess) {
      await crawlerInstance.addRequests([
        {
          url: `${SITE_CONFIG.productUrlTemplate}${basicInfo.menuSeq}`,
          userData: { basicInfo },
          label: 'PRODUCT',
        },
      ]);
    }

    logger.info(
      `Enqueued ${productsToProcess.length} products from Mammoth Coffee menu`
    );
  } catch (error) {
    logger.error(`Error extracting products from list page: ${error}`);
  }
}

// ================================================
// CRAWLER EXPORT
// ================================================

export const createMammothCrawler = () =>
  new PlaywrightCrawler({
    launchContext: {
      launchOptions: CRAWLER_CONFIG.launchOptions,
    },
    async requestHandler({ page, request, crawler: crawlerInstance }) {
      if (request.label === 'PRODUCT') {
        await handleProductPage(page, request, crawlerInstance);
      } else {
        await handleMenuListPage(page, crawlerInstance);
      }
    },
    maxConcurrency: CRAWLER_CONFIG.maxConcurrency,
    maxRequestsPerCrawl: CRAWLER_CONFIG.maxRequestsPerCrawl,
    maxRequestRetries: CRAWLER_CONFIG.maxRequestRetries,
    requestHandlerTimeoutSecs: CRAWLER_CONFIG.requestHandlerTimeoutSecs,
  });

export const runMammothCrawler = async () => {
  const crawler = createMammothCrawler();

  try {
    // Start with multiple menu pages to get comprehensive coverage
    const startUrls = [SITE_CONFIG.startUrl, ...SITE_CONFIG.menuListUrls];

    await crawler.run(startUrls);
    const dataset = await crawler.getData();
    await writeProductsToJson(dataset.items as Product[], 'mammoth');
  } catch (error) {
    logger.error('Mammoth Coffee crawler failed:', error);
    throw error;
  }
};

// Only run if this file is executed directly (not imported)
if (import.meta.url === `file://${process.argv[1]}`) {
  runMammothCrawler().catch((error) => {
    logger.error('Crawler execution failed:', error);
    process.exit(1);
  });
}
