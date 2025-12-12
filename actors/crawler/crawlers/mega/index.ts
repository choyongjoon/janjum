import type { PlaywrightCrawler } from 'crawlee';
import type { Page } from 'playwright';
import { logger } from '../../../../shared/logger';
import { registerCrawler } from '../../core';
import type { Product } from '../../core/types';
import { InlineDataCrawler } from '../../strategies/InlineDataCrawler';
import {
  extractMegaNutritionFromModal,
  extractMegaProduct,
  MEGA_SELECTORS,
  megaDefinition,
} from './config';

/**
 * MegaCrawler - Custom crawler that handles modal-based nutrition extraction
 */
class MegaCrawler extends InlineDataCrawler {
  /**
   * Override to handle pagination with next button
   */
  override async handleMainPage(
    page: Page,
    crawler: PlaywrightCrawler
  ): Promise<void> {
    logger.info(`Processing ${this.brand} main menu page with pagination`);

    await this.waitForLoad(page);

    let currentPage = 1;
    let totalProductsExtracted = 0;
    const maxPages = this.testMode.enabled ? 1 : 50;

    while (currentPage <= maxPages) {
      logger.info(`Processing page ${currentPage}...`);

      await this.waitForLoad(page);

      // Extract products from current page with modal interaction
      const products = await this.extractProductsWithModal(page, 'All Menu');

      // Push products to crawler dataset
      for (const product of products) {
        await crawler.pushData(product);
        logger.info(
          `✅ Extracted: ${product.name}${product.nutritions ? ' with nutrition' : ''}`
        );
      }

      totalProductsExtracted += products.length;

      // Check for next page
      const hasNextPage = await this.goToNextPage(page);
      if (!hasNextPage) {
        break;
      }

      currentPage++;
    }

    logger.info(
      `Pagination complete. Total products: ${totalProductsExtracted} across ${currentPage} pages`
    );
  }

  /**
   * Extract products with modal interaction for nutrition
   */
  private async extractProductsWithModal(
    page: Page,
    categoryName: string
  ): Promise<Product[]> {
    const products: Product[] = [];
    const context = this.getExtractorContext(categoryName, page.url());

    // Find product containers
    const containers = await this.findElements(
      page,
      this.definition.selectors.productContainers
    );

    // Limit containers in test mode
    const containersToProcess = this.limitItems(containers, 'products');

    logger.info(
      `Processing ${containersToProcess.length} products (found ${containers.length} total)`
    );

    // Process containers sequentially (required for modal interaction)
    for (const container of containersToProcess) {
      const productData = await extractMegaProduct(container, context);

      if (productData) {
        // Extract nutrition by opening modal
        const nutritions = await extractMegaNutritionFromModal(page, container);

        if (nutritions) {
          logger.info(`✅ Found nutrition data for: ${productData.name}`);
        }

        products.push({
          name: productData.name,
          nameEn: productData.nameEn,
          description: productData.description,
          price: null,
          externalImageUrl: productData.imageUrl,
          category: 'Drinks',
          externalCategory: categoryName,
          externalId: `${this.brand}_${productData.name}`,
          externalUrl: page.url(),
          nutritions,
        });
      }
    }

    return products;
  }

  /**
   * Navigate to next page using next button
   */
  private async goToNextPage(page: Page): Promise<boolean> {
    const nextButton = page.locator(MEGA_SELECTORS.pagination.nextButton);
    const nextButtonCount = await nextButton.count();

    if (nextButtonCount === 0) {
      logger.info('No next page button found');
      return false;
    }

    // Check if the next button is disabled
    const isDisabled = await nextButton
      .evaluate((el) => {
        return (
          el.hasAttribute('disabled') ||
          el.classList.contains('disabled') ||
          el.style.display === 'none' ||
          !(el as HTMLElement).offsetParent
        );
      })
      .catch(() => true);

    if (isDisabled) {
      logger.info('Next page button is disabled');
      return false;
    }

    try {
      await nextButton.click();
      await this.waitForLoad(page);
      return true;
    } catch (error) {
      logger.info(`Failed to click next button: ${error}`);
      return false;
    }
  }
}

// Factory function to create Mega crawler
function createMegaCrawler(): MegaCrawler {
  return new MegaCrawler(megaDefinition);
}

// Register the crawler factory
registerCrawler(megaDefinition.config.brand, createMegaCrawler);

export { megaDefinition } from './config';
export { createMegaCrawler };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createMegaCrawler()
    .run()
    .catch((error) => {
      logger.error('Crawler execution failed:', error);
      process.exit(1);
    });
}
