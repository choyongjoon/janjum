import type { PlaywrightCrawler } from 'crawlee';
import type { Page } from 'playwright';
import { logger } from '../../../../shared/logger';
import { type Product, registerCrawler } from '../../core';
import { ListDetailCrawler } from '../../strategies';
import {
  extractStarbucksNutrition,
  extractStarbucksProductData,
  extractStarbucksProductIds,
  STARBUCKS_CONFIG,
  STARBUCKS_SELECTORS,
  starbucksDefinition,
} from './config';

/**
 * StarbucksCrawler - Custom implementation extending ListDetailCrawler
 * Starbucks requires custom handling due to its unique URL structure
 */
class StarbucksCrawler extends ListDetailCrawler {
  constructor() {
    super(starbucksDefinition);
  }

  /**
   * Override main page handler to extract product IDs and enqueue detail pages
   */
  async handleMainPage(page: Page, crawler: PlaywrightCrawler): Promise<void> {
    logger.info('Processing Starbucks drink list page');

    await this.waitForLoad(page);

    // Extract product IDs from listing page
    const productIds = await extractStarbucksProductIds(page);
    logger.info(`Found ${productIds.length} products to crawl`);

    // Limit in test mode
    const idsToProcess = this.limitItems(productIds, 'products');

    if (this.testMode.enabled) {
      logger.info(`🧪 Test mode: limiting to ${idsToProcess.length} products`);
    }

    // Enqueue product detail pages
    const productRequests = idsToProcess.map((productId) => ({
      url: `${STARBUCKS_CONFIG.productUrlTemplate}${productId}`,
      userData: {
        isProductPage: true,
        productId,
        categoryName: 'Drinks',
      },
    }));

    await crawler.addRequests(productRequests);
    logger.info(`Enqueued ${idsToProcess.length} product pages for processing`);
  }

  /**
   * Override product page handler
   */
  protected override async handleProductPage(
    page: Page,
    request: { url: string; userData: Record<string, unknown> },
    crawler: PlaywrightCrawler
  ): Promise<void> {
    const productId = request.userData.productId as string;
    logger.info(`Processing product page: ${productId}`);

    try {
      await this.waitForLoad(page);

      // Wait for product content to load
      await page.waitForSelector(STARBUCKS_SELECTORS.productData.name, {
        timeout: 5000,
      });

      // Extract product data
      const context = this.getExtractorContext('Drinks', page.url());
      const productData = await extractStarbucksProductData(page, context);

      if (!productData.name) {
        logger.warn(`Failed to extract product name for ID: ${productId}`);
        return;
      }

      // Extract nutrition data
      const nutritions = await extractStarbucksNutrition(page, context);

      // Get external ID from URL
      const urlParams = new URLSearchParams(new URL(page.url()).search);
      const externalId = urlParams.get('product_cd') || productId;

      // Get category from page (same selector as v1)
      const categoryText = await page
        .locator('.cate')
        .textContent()
        .catch(() => '');
      const externalCategory = categoryText?.trim() || 'Drinks';

      const product: Product = {
        name: productData.name,
        nameEn: productData.nameEn,
        description: productData.description,
        price: null,
        externalImageUrl: productData.imageUrl,
        category: 'Drinks',
        externalCategory,
        externalId,
        externalUrl: page.url(),
        nutritions,
      };

      await crawler.pushData(product);
      logger.info(
        `✅ Extracted: ${product.name} (${product.nameEn})${nutritions ? ' with nutrition' : ''}`
      );
    } catch (error) {
      logger.error(`❌ Error processing product ${productId}: ${error}`);
    }
  }
}

// Create the crawler instance
export function createStarbucksCrawlerV2() {
  return new StarbucksCrawler();
}

// Register the crawler
registerCrawler('starbucks', createStarbucksCrawlerV2);

// Run function for direct execution
export async function runStarbucksCrawlerV2() {
  const crawler = createStarbucksCrawlerV2();
  await crawler.run();
}

// Export definition for reference
export { starbucksDefinition } from './config';

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runStarbucksCrawlerV2().catch((error) => {
    logger.error('Starbucks crawler execution failed:', error);
    process.exit(1);
  });
}
