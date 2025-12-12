import type { PlaywrightCrawler } from 'crawlee';
import type { Locator, Page } from 'playwright';
import { logger } from '../../../../shared/logger';
import { registerCrawler } from '../../core';
import type { Product } from '../../core/types';
import { ListDetailCrawler } from '../../strategies/ListDetailCrawler';
import {
  extractGongchaNutrition,
  GONGCHA_CONFIG,
  generateGongchaExternalId,
  gongchaDefinition,
} from './config';

/**
 * GongchaCrawler - Custom crawler for Gongcha
 * Handles the unique navigation pattern where clicking a product
 * navigates to a detail page (not modal) and requires going back
 */
class GongchaCrawler extends ListDetailCrawler {
  /**
   * Override main page handling - process start page as a category
   * and enqueue other categories
   */
  override async handleMainPage(
    page: Page,
    crawler: PlaywrightCrawler
  ): Promise<void> {
    logger.info(`Processing ${this.brand} start page`);

    await this.waitForLoad(page);

    // Extract category name from current page
    const categoryName = await this.extractCategoryName(page);

    // Process products on current page
    const products = await this.extractProductsWithNavigation(
      page,
      categoryName
    );

    for (const product of products) {
      await crawler.pushData(product);
      logger.info(
        `✅ Extracted: ${product.name}${product.nutritions ? ' with nutrition' : ''}`
      );
    }

    logger.info(`📊 Added ${products.length} products from ${categoryName}`);

    // Enqueue other category pages
    const categories = await this.extractCategories(page);
    const currentUrl = page.url();

    const otherCategories = categories.filter((cat) => cat.url !== currentUrl);
    const categoriesToProcess = this.limitItems(otherCategories, 'categories');

    if (categoriesToProcess.length > 0) {
      const categoryRequests = categoriesToProcess.map((category) => ({
        url: category.url,
        userData: {
          isCategoryPage: true,
          categoryName: category.name,
        },
      }));

      await crawler.addRequests(categoryRequests);
      logger.info(`📋 Enqueued ${categoryRequests.length} category pages`);
    }
  }

  /**
   * Override category page handling
   */
  protected override async handleCategoryPage(
    page: Page,
    request: { url: string; userData: Record<string, unknown> },
    crawler: PlaywrightCrawler
  ): Promise<void> {
    const categoryName =
      (request.userData.categoryName as string) ||
      (await this.extractCategoryName(page));

    logger.info(`Processing category: ${categoryName}`);

    await this.waitForLoad(page);

    const products = await this.extractProductsWithNavigation(
      page,
      categoryName
    );

    for (const product of products) {
      await crawler.pushData(product);
      logger.info(
        `✅ Extracted: ${product.name}${product.nutritions ? ' with nutrition' : ''}`
      );
    }

    logger.info(`📊 Added ${products.length} products from ${categoryName}`);
  }

  /**
   * Extract category name from active tab
   */
  private async extractCategoryName(page: Page): Promise<string> {
    try {
      const activeTabText = await page
        .locator('.tabWrap ul li.active a')
        .textContent()
        .catch(() => '');

      if (activeTabText?.trim()) {
        return activeTabText.trim();
      }
    } catch {
      // Fall through to default
    }
    return 'New 시즌 메뉴';
  }

  /**
   * Extract products by navigating to each detail page
   */
  private async extractProductsWithNavigation(
    page: Page,
    categoryName: string
  ): Promise<Product[]> {
    const products: Product[] = [];
    const currentUrl = page.url();

    await page.waitForTimeout(500);

    // Find product containers
    const productContainers = await page
      .locator('li')
      .filter({
        has: page.locator('a[href*="detail"]'),
      })
      .all();

    const containersToProcess = this.limitItems(productContainers, 'products');

    logger.info(
      `Found ${productContainers.length} products, processing ${containersToProcess.length}`
    );

    for (const container of containersToProcess) {
      const product = await this.extractProductFromContainer(
        page,
        container,
        categoryName,
        currentUrl
      );

      if (product) {
        products.push(product);
      }

      // Small delay between products
      await page.waitForTimeout(300);
    }

    return products;
  }

  /**
   * Extract a single product by navigating to its detail page
   */
  private async extractProductFromContainer(
    page: Page,
    container: Locator,
    categoryName: string,
    returnUrl: string
  ): Promise<Product | null> {
    try {
      // Extract basic info
      const imageElement = container.locator('img').first();
      const imageSrc = await imageElement.getAttribute('src').catch(() => '');

      const containerText =
        (await container.textContent().catch(() => '')) || '';
      const productName = containerText.replace(/\s+/g, ' ').trim();

      if (!productName) {
        return null;
      }

      const productLink = container.locator('a[href*="detail"]').first();
      const productHref = await productLink
        .getAttribute('href')
        .catch(() => '');
      const productDetailUrl = productHref
        ? new URL(productHref, GONGCHA_CONFIG.baseUrl).href
        : returnUrl;

      // Navigate to detail page
      logger.info(`Navigating to detail page for: ${productName}`);

      await productLink.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await productLink.click({ timeout: 5000 });
      await page.waitForTimeout(1000);

      // Extract description
      let description = '';
      const descElement = page.locator('.text-a .t2').first();
      if ((await descElement.count()) > 0) {
        description = ((await descElement.textContent()) || '').trim();
      }

      // Extract nutrition
      const nutritions = await extractGongchaNutrition(page, {
        baseUrl: this.baseUrl,
        categoryName,
        pageUrl: page.url(),
      });

      // Navigate back
      await page.goto(returnUrl);
      await page.waitForTimeout(500);

      const externalId = generateGongchaExternalId(imageSrc || '');

      return {
        name: productName,
        nameEn: null,
        description: description || null,
        price: null,
        externalImageUrl: imageSrc
          ? new URL(imageSrc, GONGCHA_CONFIG.baseUrl).href
          : '',
        category: categoryName,
        externalCategory: categoryName,
        externalId,
        externalUrl: productDetailUrl,
        nutritions,
      };
    } catch (error) {
      logger.error(`Error extracting product: ${error}`);
      // Try to navigate back on error
      try {
        await page.goto(returnUrl);
        await page.waitForTimeout(500);
      } catch {
        // Ignore navigation errors
      }
      return null;
    }
  }
}

// Factory function to create Gongcha crawler
function createGongchaCrawler(): GongchaCrawler {
  return new GongchaCrawler(gongchaDefinition);
}

// Register the crawler factory
registerCrawler(gongchaDefinition.config.brand, createGongchaCrawler);

export { gongchaDefinition } from './config';
export { createGongchaCrawler };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createGongchaCrawler()
    .run()
    .catch((error) => {
      logger.error('Crawler execution failed:', error);
      process.exit(1);
    });
}
