import type { PlaywrightCrawler } from 'crawlee';
import type { Page } from 'playwright';
import { logger } from '../../../shared/logger';
import { BaseCrawler } from '../core/BaseCrawler';
import type {
  CategoryInfo,
  CrawlerDefinition,
  ExtractorContext,
  Product,
} from '../core/types';

// Regex patterns at top level for performance
const GO_VIEW_PATTERN = /go\w*\(['"]?(\w+)['"]?\)/i;
const PRICE_PATTERN = /[\d,]+/;
const COMMA_PATTERN = /,/g;

/**
 * ListDetailCrawler - For sites where products are listed on category pages
 * but full data (especially nutrition) requires navigating to detail pages.
 *
 * Used by: starbucks, gongcha, twosome, hollys, mammoth, paulbassett
 */
export class ListDetailCrawler extends BaseCrawler {
  constructor(definition: CrawlerDefinition) {
    super(definition);

    if (definition.strategy !== 'list-detail') {
      logger.warn(
        `ListDetailCrawler used with strategy '${definition.strategy}', expected 'list-detail'`
      );
    }
  }

  /**
   * Handle the main/start page - extract product URLs and enqueue them
   */
  async handleMainPage(page: Page, crawler: PlaywrightCrawler): Promise<void> {
    logger.info(`Processing ${this.brand} main menu page`);

    await this.waitForLoad(page);

    // Try to discover categories first
    const categories = await this.extractCategories(page);

    if (categories.length > 0) {
      await this.enqueueCategories(categories, crawler);
    } else {
      // No categories, extract products from current page
      logger.info('No categories found, extracting products from current page');
      await this.extractAndEnqueueProducts(page, 'All Items', crawler);
    }
  }

  /**
   * Enqueue category pages for processing
   */
  private async enqueueCategories(
    categories: CategoryInfo[],
    crawler: PlaywrightCrawler
  ): Promise<void> {
    const categoriesToProcess = this.limitItems(categories, 'categories');

    logger.info(
      `Found ${categories.length} categories, enqueueing ${categoriesToProcess.length}`
    );

    const categoryRequests = categoriesToProcess.map((category) => ({
      url: category.url,
      userData: {
        isCategoryPage: true,
        categoryName: category.name,
        categoryId: category.id,
      },
    }));

    await crawler.addRequests(categoryRequests);
    logger.info(`📋 Enqueued ${categoryRequests.length} category pages`);
  }

  /**
   * Handle category page - extract product URLs and enqueue detail pages
   */
  protected override async handleCategoryPage(
    page: Page,
    request: { url: string; userData: Record<string, unknown> },
    crawler: PlaywrightCrawler
  ): Promise<void> {
    const categoryName = (request.userData.categoryName as string) || 'Default';
    logger.info(`Processing category: ${categoryName}`);

    await this.waitForLoad(page);
    await this.extractAndEnqueueProducts(page, categoryName, crawler);
  }

  /**
   * Extract basic product info from listing and enqueue detail pages
   */
  private async extractAndEnqueueProducts(
    page: Page,
    categoryName: string,
    crawler: PlaywrightCrawler
  ): Promise<void> {
    // Handle pagination first if needed
    if (this.definition.pagination === 'load-more') {
      await this.handleLoadMorePagination(page);
    }

    const context = this.getExtractorContext(categoryName, page.url());
    const containers = await this.findElements(
      page,
      this.definition.selectors.productContainers
    );

    const containersToProcess = this.limitItems(containers, 'products');
    logger.info(
      `Found ${containers.length} products, processing ${containersToProcess.length}`
    );

    const productRequests: Array<{
      url: string;
      userData: Record<string, unknown>;
    }> = [];

    for (const container of containersToProcess) {
      try {
        const basicInfo = await this.extractBasicProductInfo(
          container,
          context
        );
        if (basicInfo?.detailUrl) {
          productRequests.push({
            url: basicInfo.detailUrl,
            userData: {
              isProductPage: true,
              categoryName,
              basicInfo,
            },
          });
        }
      } catch (error) {
        logger.debug(`Failed to extract basic product info: ${error}`);
      }
    }

    if (productRequests.length > 0) {
      await crawler.addRequests(productRequests);
      logger.info(
        `🚀 Enqueued ${productRequests.length} product detail pages from ${categoryName}`
      );
    }
  }

  /**
   * Extract basic product info from listing (name, image, detail URL)
   */
  private async extractBasicProductInfo(
    container: import('playwright').Locator,
    _context: ExtractorContext
  ): Promise<{
    name: string;
    nameEn: string | null;
    imageUrl: string;
    detailUrl: string;
    externalId?: string;
  } | null> {
    const { productData } = this.definition.selectors;

    const name = await this.getText(
      container.locator(productData.name).first()
    );
    if (!name) {
      return null;
    }

    const [nameEn, imageUrl, href] = await Promise.all([
      productData.nameEn
        ? this.getText(container.locator(productData.nameEn).first())
        : Promise.resolve(null),
      this.getImageUrl(container.locator(productData.image).first()),
      productData.link
        ? this.getAttribute(container.locator(productData.link).first(), 'href')
        : Promise.resolve(''),
    ]);

    // Build detail URL
    let detailUrl = '';
    if (href) {
      detailUrl = this.buildUrl(href);
    } else if (this.definition.config.productUrlTemplate) {
      // Try to extract product ID from container for template-based URLs
      const externalId = await this.extractProductIdFromContainer(container);
      if (externalId) {
        detailUrl = `${this.definition.config.productUrlTemplate}${externalId}`;
      }
    }

    if (!detailUrl) {
      logger.debug(`No detail URL for product: ${name}`);
      return null;
    }

    return {
      name,
      nameEn,
      imageUrl,
      detailUrl,
    };
  }

  /**
   * Extract product ID from container (for template-based URLs)
   * Can be overridden by subclasses for site-specific logic
   */
  protected async extractProductIdFromContainer(
    container: import('playwright').Locator
  ): Promise<string | null> {
    // Default: try to extract from data attributes or onclick
    const link = container.locator('a').first();

    // Try data attribute
    const dataId = await this.getAttribute(link, 'data-id');
    if (dataId) {
      return dataId;
    }

    // Try onclick attribute with common patterns
    const onclick = await this.getAttribute(link, 'onclick');
    if (onclick) {
      // Match patterns like goView('123'), goViewB(123), etc.
      const match = onclick.match(GO_VIEW_PATTERN);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Handle product detail page - extract full data including nutrition
   */
  protected override async handleProductPage(
    page: Page,
    request: { url: string; userData: Record<string, unknown> },
    crawler: PlaywrightCrawler
  ): Promise<void> {
    const basicInfo = request.userData.basicInfo as {
      name: string;
      nameEn: string | null;
      imageUrl: string;
      detailUrl: string;
    };
    const categoryName = (request.userData.categoryName as string) || 'Default';

    logger.info(`🔗 Processing product detail: ${basicInfo.name}`);

    try {
      await this.waitForLoad(page);

      const context = this.getExtractorContext(categoryName, page.url());

      // Extract nutrition from detail page
      const nutritions = await this.extractNutritionFromPage(page, context);

      // Extract additional details if available
      const additionalDetails = await this.extractAdditionalDetails(page);

      const product: Product = {
        name: basicInfo.name,
        nameEn: basicInfo.nameEn,
        description: additionalDetails.description,
        price: additionalDetails.price,
        externalImageUrl: basicInfo.imageUrl || additionalDetails.imageUrl,
        category: null,
        externalCategory: categoryName,
        externalId: `${this.brand}_${basicInfo.name}`,
        externalUrl: page.url(),
        nutritions,
      };

      await crawler.pushData(product);
      logger.info(
        `✅ Extracted: ${product.name}${nutritions ? ' with nutrition' : ''}`
      );
    } catch (error) {
      logger.error(`Failed to process product ${basicInfo.name}: ${error}`);
    }
  }

  /**
   * Extract additional details from product detail page
   */
  private async extractAdditionalDetails(page: Page): Promise<{
    description: string | null;
    price: number | null;
    imageUrl: string;
  }> {
    const { productData } = this.definition.selectors;

    let description: string | null = null;
    let price: number | null = null;
    let imageUrl = '';

    if (productData.description) {
      description = await this.getText(
        page.locator(productData.description).first()
      );
    }

    if (productData.price) {
      const priceText = await this.getText(
        page.locator(productData.price).first()
      );
      if (priceText) {
        const match = priceText.match(PRICE_PATTERN);
        if (match) {
          price = Number.parseInt(match[0].replace(COMMA_PATTERN, ''), 10);
        }
      }
    }

    // Try to get better quality image from detail page
    if (productData.image) {
      const detailImage = await this.getImageUrl(
        page.locator(productData.image).first()
      );
      if (detailImage) {
        imageUrl = detailImage;
      }
    }

    return { description, price, imageUrl };
  }
}

/**
 * Factory function to create a ListDetailCrawler
 */
export function createListDetailCrawler(
  definition: CrawlerDefinition
): ListDetailCrawler {
  return new ListDetailCrawler(definition);
}
