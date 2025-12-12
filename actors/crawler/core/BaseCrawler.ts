import { PlaywrightCrawler } from 'crawlee';
import type { Locator, Page } from 'playwright';
import { logger } from '../../../shared/logger';
import type { Nutritions } from '../../../shared/nutritions';
import { waitForLoad, writeProductsToJson } from '../crawlerUtils';
import {
  type CategoryInfo,
  type CrawlerDefinition,
  type CrawlerOptions,
  type ExtractorContext,
  getCrawlerOptions,
  getTestModeConfig,
  type Product,
  type TestModeConfig,
} from './types';

export abstract class BaseCrawler {
  protected definition: CrawlerDefinition;
  protected options: CrawlerOptions;
  protected testMode: TestModeConfig;

  constructor(definition: CrawlerDefinition) {
    this.definition = definition;
    this.testMode = getTestModeConfig();
    this.options = getCrawlerOptions(definition.options, this.testMode);
  }

  // ================================================
  // ABSTRACT METHODS (must be implemented by subclasses)
  // ================================================

  /**
   * Handle the main/start page of the crawler
   */
  abstract handleMainPage(
    page: Page,
    crawler: PlaywrightCrawler
  ): Promise<void>;

  // ================================================
  // PROTECTED HELPER METHODS
  // ================================================

  protected get brand(): string {
    return this.definition.config.brand;
  }

  protected get baseUrl(): string {
    return this.definition.config.baseUrl;
  }

  protected getExtractorContext(
    categoryName?: string,
    pageUrl?: string
  ): ExtractorContext {
    return {
      baseUrl: this.baseUrl,
      categoryName,
      pageUrl,
    };
  }

  /**
   * Wait for page to load
   */
  protected async waitForLoad(page: Page, timeout = 15_000): Promise<void> {
    await waitForLoad(page, timeout);
  }

  /**
   * Build full URL from relative path
   */
  protected buildUrl(path: string): string {
    if (path.startsWith('http')) {
      return path;
    }
    if (path.startsWith('/')) {
      return `${this.baseUrl}${path}`;
    }
    return `${this.baseUrl}/${path}`;
  }

  /**
   * Find elements using selector(s)
   */
  protected async findElements(
    page: Page,
    selectors: string | string[]
  ): Promise<Locator[]> {
    const selectorList = Array.isArray(selectors) ? selectors : [selectors];

    for (const selector of selectorList) {
      const elements = page.locator(selector);
      const count = await elements.count();
      if (count > 0) {
        logger.info(`Found ${count} elements with selector: ${selector}`);
        return elements.all();
      }
    }

    logger.warn('No elements found with any selector');
    return [];
  }

  /**
   * Limit items based on test mode
   */
  protected limitItems<T>(items: T[], type: 'products' | 'categories'): T[] {
    if (!this.testMode.enabled) {
      return items;
    }

    const limit =
      type === 'products'
        ? this.testMode.maxProducts
        : this.testMode.maxCategories;

    if (items.length > limit) {
      logger.info(`🧪 Test mode: limiting ${type} to ${limit}`);
      return items.slice(0, limit);
    }

    return items;
  }

  /**
   * Extract text content from locator
   */
  protected async getText(locator: Locator, fallback = ''): Promise<string> {
    try {
      const text = await locator.textContent();
      return text?.trim() || fallback;
    } catch {
      return fallback;
    }
  }

  /**
   * Extract attribute from locator
   */
  protected async getAttribute(
    locator: Locator,
    attr: string,
    fallback = ''
  ): Promise<string> {
    try {
      const value = await locator.getAttribute(attr);
      return value || fallback;
    } catch {
      return fallback;
    }
  }

  /**
   * Extract image URL with base URL resolution
   */
  protected async getImageUrl(locator: Locator): Promise<string> {
    const src = await this.getAttribute(locator, 'src');
    return src ? this.buildUrl(src) : '';
  }

  // ================================================
  // PRODUCT EXTRACTION
  // ================================================

  /**
   * Extract product data from a container element
   */
  protected async extractProductFromContainer(
    container: Locator,
    context: ExtractorContext
  ): Promise<Product | null> {
    try {
      const { productData } = this.definition.selectors;

      // Use custom extractor if provided
      if (this.definition.extractProduct) {
        const result = await this.definition.extractProduct(container, context);
        if (!result) {
          return null;
        }

        // Also extract nutrition if extractor is provided
        let nutritions: Nutritions | null = result.nutritions || null;
        if (!nutritions && this.definition.extractNutrition) {
          nutritions = await this.extractNutritionFromContainer(
            container,
            context
          );
        }

        return this.createProduct({ ...result, nutritions }, context);
      }

      // Default extraction logic
      const [name, nameEn, description, imageUrl] = await Promise.all([
        this.getText(container.locator(productData.name).first()),
        productData.nameEn
          ? this.getText(container.locator(productData.nameEn).first())
          : Promise.resolve(null),
        productData.description
          ? this.getText(container.locator(productData.description).first())
          : Promise.resolve(null),
        this.getImageUrl(container.locator(productData.image).first()),
      ]);

      if (!name) {
        return null;
      }

      // Extract nutrition if selector is provided
      let nutritions: Nutritions | null = null;
      if (this.definition.selectors.nutrition) {
        nutritions = await this.extractNutritionFromContainer(
          container,
          context
        );
      }

      const categoryName = context.categoryName || 'Default';
      return {
        name,
        nameEn,
        description,
        price: null,
        externalImageUrl: imageUrl,
        category: 'Drinks',
        externalCategory: categoryName,
        externalId: `${this.brand}_${categoryName}_${name}`,
        externalUrl: context.pageUrl || '',
        nutritions,
      };
    } catch (error) {
      logger.debug(`Failed to extract product: ${error}`);
      return null;
    }
  }

  /**
   * Create a Product object from extracted data
   */
  protected createProduct(
    data: {
      name: string;
      nameEn: string | null;
      description: string | null;
      imageUrl: string;
      price?: number | null;
      externalId?: string;
      externalUrl?: string;
      nutritions?: Nutritions | null;
    },
    context: ExtractorContext
  ): Product {
    const categoryName = context.categoryName || 'Default';
    return {
      name: data.name,
      nameEn: data.nameEn,
      description: data.description,
      price: data.price || null,
      externalImageUrl: data.imageUrl,
      category: 'Drinks',
      externalCategory: categoryName,
      externalId:
        data.externalId || `${this.brand}_${categoryName}_${data.name}`,
      externalUrl: data.externalUrl || context.pageUrl || '',
      nutritions: data.nutritions || null,
    };
  }

  // ================================================
  // NUTRITION EXTRACTION
  // ================================================

  /**
   * Extract nutrition data from a container element
   */
  protected async extractNutritionFromContainer(
    container: Locator,
    context: ExtractorContext
  ): Promise<Nutritions | null> {
    // Use custom extractor if provided
    if (this.definition.extractNutrition) {
      return await this.definition.extractNutrition(container, context);
    }

    // Default: no nutrition extraction
    return null;
  }

  /**
   * Extract nutrition data from a page
   */
  protected async extractNutritionFromPage(
    page: Page,
    context: ExtractorContext
  ): Promise<Nutritions | null> {
    // Use custom extractor if provided
    if (this.definition.extractNutrition) {
      return await this.definition.extractNutrition(page, context);
    }

    return null;
  }

  // ================================================
  // CATEGORY EXTRACTION
  // ================================================

  /**
   * Extract categories from the page
   */
  protected async extractCategories(page: Page): Promise<CategoryInfo[]> {
    // Use custom extractor if provided
    if (this.definition.extractCategories) {
      return this.definition.extractCategories(
        page,
        this.getExtractorContext()
      );
    }

    // Default category extraction
    const { categoryLinks } = this.definition.selectors;
    if (!categoryLinks) {
      return [];
    }

    const categories: CategoryInfo[] = [];
    const links = await page.locator(categoryLinks).all();

    for (const link of links) {
      const [name, href] = await Promise.all([
        this.getText(link),
        this.getAttribute(link, 'href'),
      ]);

      if (name && href) {
        categories.push({
          name,
          url: this.buildUrl(href),
        });
      }
    }

    return categories;
  }

  // ================================================
  // PAGINATION HANDLING
  // ================================================

  /**
   * Handle "Load More" pagination
   */
  protected async handleLoadMorePagination(page: Page): Promise<number> {
    const selector = this.definition.selectors.pagination?.loadMore;
    if (!selector) {
      return 0;
    }

    let clickCount = 0;
    const maxClicks = this.testMode.enabled ? 1 : 20;

    while (clickCount < maxClicks) {
      const button = page.locator(selector).first();
      const isVisible = await button.isVisible().catch(() => false);

      if (!isVisible) {
        break;
      }

      try {
        await button.click();
        await page.waitForTimeout(1000);
        clickCount++;
        logger.info(`Clicked "Load More" (${clickCount})`);
      } catch {
        break;
      }
    }

    return clickCount;
  }

  /**
   * Handle "Next Button" pagination
   */
  protected async handleNextButtonPagination(page: Page): Promise<boolean> {
    const selector = this.definition.selectors.pagination?.nextButton;
    if (!selector) {
      return false;
    }

    const nextButton = page.locator(selector).first();
    const isVisible = await nextButton.isVisible().catch(() => false);
    const isEnabled = await nextButton.isEnabled().catch(() => false);

    if (isVisible && isEnabled) {
      try {
        await nextButton.click();
        await this.waitForLoad(page);
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  // ================================================
  // CRAWLER CREATION & EXECUTION
  // ================================================

  /**
   * Create the PlaywrightCrawler instance
   */
  create(): PlaywrightCrawler {
    return new PlaywrightCrawler({
      launchContext: {
        launchOptions: this.options.launchOptions,
      },
      requestHandler: async ({ page, request, crawler }) => {
        // Use custom handler if provided
        if (this.definition.customHandler) {
          await this.definition.customHandler({
            page,
            request,
            crawler,
            definition: this.definition,
          });
          return;
        }

        // Default routing
        await this.handleRequest(page, request, crawler);
      },
      maxConcurrency: this.options.maxConcurrency,
      maxRequestsPerCrawl: this.options.maxRequestsPerCrawl,
      maxRequestRetries: this.options.maxRequestRetries,
      requestHandlerTimeoutSecs: this.options.requestHandlerTimeoutSecs,
    });
  }

  /**
   * Default request handler - can be overridden
   */
  protected async handleRequest(
    page: Page,
    request: { url: string; userData: Record<string, unknown> },
    crawler: PlaywrightCrawler
  ): Promise<void> {
    if (request.userData?.isCategoryPage) {
      await this.handleCategoryPage(page, request, crawler);
    } else if (request.userData?.isProductPage) {
      await this.handleProductPage(page, request, crawler);
    } else {
      await this.handleMainPage(page, crawler);
    }
  }

  /**
   * Handle category page - default implementation
   */
  protected async handleCategoryPage(
    page: Page,
    request: { url: string; userData: Record<string, unknown> },
    crawler: PlaywrightCrawler
  ): Promise<void> {
    const categoryName = (request.userData.categoryName as string) || 'Default';
    logger.info(`Processing category: ${categoryName}`);

    await this.waitForLoad(page);
    const products = await this.extractProductsFromPage(page, categoryName);

    for (const product of products) {
      await crawler.pushData(product);
      logger.info(`✅ Extracted: ${product.name}`);
    }

    logger.info(`Added ${products.length} products from ${categoryName}`);
  }

  /**
   * Handle product detail page - default implementation
   */
  protected handleProductPage(
    _page: Page,
    _request: { url: string; userData: Record<string, unknown> },
    _crawler: PlaywrightCrawler
  ): Promise<void> {
    // To be implemented by subclasses that need detail page handling
    logger.warn('handleProductPage not implemented');
    return Promise.resolve();
  }

  /**
   * Extract all products from current page
   */
  protected async extractProductsFromPage(
    page: Page,
    categoryName: string
  ): Promise<Product[]> {
    const products: Product[] = [];
    const context = this.getExtractorContext(categoryName, page.url());

    // Handle pagination first if needed
    if (this.definition.pagination === 'load-more') {
      await this.handleLoadMorePagination(page);
    }

    // Find product containers
    const containers = await this.findElements(
      page,
      this.definition.selectors.productContainers
    );

    // Limit containers in test mode
    const containersToProcess = this.limitItems(containers, 'products');

    // Extract products
    for (const container of containersToProcess) {
      const product = await this.extractProductFromContainer(
        container,
        context
      );
      if (product) {
        products.push(product);
      }
    }

    return products;
  }

  /**
   * Run the crawler
   */
  async run(): Promise<void> {
    const crawler = this.create();

    try {
      logger.info(`🚀 Starting ${this.brand} crawler`);

      const startUrls = this.definition.config.categoryUrls?.length
        ? this.definition.config.categoryUrls
        : [this.definition.config.startUrl];

      await crawler.run(startUrls);

      const dataset = await crawler.getData();
      await writeProductsToJson(dataset.items as Product[], this.brand);

      logger.info(`✅ ${this.brand} crawler completed`);
    } catch (error) {
      logger.error(`${this.brand} crawler failed:`, error);
      throw error;
    }
  }
}
