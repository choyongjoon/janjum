import type { PlaywrightCrawler } from 'crawlee';
import type { Page } from 'playwright';
import { logger } from '../../../shared/logger';
import { BaseCrawler } from '../core/BaseCrawler';
import type { CategoryInfo, CrawlerDefinition } from '../core/types';

/**
 * InlineDataCrawler - For sites where all product data (including nutrition)
 * is available on the listing page without navigation to detail pages.
 *
 * Used by: ediya, paik, coffeebean, compose, mega
 */
export class InlineDataCrawler extends BaseCrawler {
  constructor(definition: CrawlerDefinition) {
    super(definition);

    if (
      definition.strategy !== 'inline-data' &&
      definition.strategy !== 'modal'
    ) {
      logger.warn(
        `InlineDataCrawler used with strategy '${definition.strategy}', expected 'inline-data' or 'modal'`
      );
    }
  }

  /**
   * Handle the main/start page
   */
  async handleMainPage(page: Page, crawler: PlaywrightCrawler): Promise<void> {
    logger.info(`Processing ${this.brand} main menu page`);

    await this.waitForLoad(page);

    // Try to discover categories
    const categories = await this.extractCategories(page);

    if (categories.length > 0) {
      await this.processCategoriesSequentially(page, categories, crawler);
    } else {
      // No categories found, process current page
      logger.info('No categories found, processing current page');
      await this.processCurrentPage(page, 'All Items', crawler);
    }
  }

  /**
   * Process categories by navigating to each one
   */
  private async processCategoriesSequentially(
    page: Page,
    categories: CategoryInfo[],
    crawler: PlaywrightCrawler
  ): Promise<void> {
    const categoriesToProcess = this.limitItems(categories, 'categories');

    logger.info(
      `Found ${categories.length} categories, processing ${categoriesToProcess.length}`
    );

    for (let i = 0; i < categoriesToProcess.length; i++) {
      const category = categoriesToProcess[i];
      logger.info(
        `📂 Processing category ${i + 1}/${categoriesToProcess.length}: ${category.name}`
      );

      try {
        await page.goto(category.url);
        await this.waitForLoad(page);
        await this.processCurrentPage(page, category.name, crawler);
      } catch (error) {
        logger.error(`Failed to process category ${category.name}: ${error}`);
      }
    }
  }

  /**
   * Process all products on the current page
   */
  private async processCurrentPage(
    page: Page,
    categoryName: string,
    crawler: PlaywrightCrawler
  ): Promise<void> {
    const products = await this.extractProductsFromPage(page, categoryName);

    // Push products to crawler dataset
    for (const product of products) {
      await crawler.pushData(product);
      logger.info(
        `✅ Extracted: ${product.name}${product.nutritions ? ' with nutrition' : ''}`
      );
    }

    logger.info(`📊 Added ${products.length} products from ${categoryName}`);
  }

  /**
   * Override to handle category pages that are enqueued
   */
  protected override async handleCategoryPage(
    page: Page,
    request: { url: string; userData: Record<string, unknown> },
    crawler: PlaywrightCrawler
  ): Promise<void> {
    const categoryName = (request.userData.categoryName as string) || 'Default';
    await this.processCurrentPage(page, categoryName, crawler);
  }
}

/**
 * Factory function to create an InlineDataCrawler
 */
export function createInlineDataCrawler(
  definition: CrawlerDefinition
): InlineDataCrawler {
  return new InlineDataCrawler(definition);
}
