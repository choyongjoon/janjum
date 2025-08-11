import { PlaywrightCrawler } from 'crawlee';
import type { ElementHandle, Page } from 'playwright';

// Korean language regex pattern (defined at top level for performance)
const KOREAN_REGEX = /[가-힣]/;

import { logger } from '../../shared/logger';
import { PricerUtils } from './pricerUtils';
import type { PricerResult, ProductPrice } from './types';

export class StarbucksPricer {
  private pricerUtils: PricerUtils;
  private readonly NAVER_MAP_URL =
    'https://m.booking.naver.com/order/bizes/391504/items/3538517?theme=place&service-target=map-pc&refererCode=menutab&lang=ko&area=bmp&map-search=1&locale=ko-KR';
  private readonly CAFE_SLUG = 'starbucks';
  private readonly SOURCE = 'naver-map';

  constructor(convexUrl: string) {
    this.pricerUtils = new PricerUtils(convexUrl);
  }

  /**
   * Scroll down the page to load all products (handles lazy loading/infinite scroll)
   */
  private async scrollToLoadAllProducts(page: Page): Promise<void> {
    logger.info('Starting scroll to load all products...');

    let previousProductCount = 0;
    let currentProductCount = 0;
    let noChangeCount = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 30;

    do {
      currentProductCount = await this.countProducts(page);
      logger.info(
        `Products found: ${currentProductCount} (scroll ${scrollAttempts + 1})`
      );

      await this.performScrollStep(page, scrollAttempts);
      scrollAttempts++;

      const shouldStop = this.checkStopCondition(
        currentProductCount,
        previousProductCount,
        noChangeCount
      );

      if (shouldStop.stop) {
        noChangeCount = shouldStop.noChangeCount;
        if (shouldStop.break) {
          break;
        }
      } else {
        logger.info(
          `✅ Found ${currentProductCount - previousProductCount} more products!`
        );
        noChangeCount = 0;
      }

      previousProductCount = currentProductCount;
    } while (scrollAttempts < maxScrollAttempts);

    await this.takeScrollScreenshot(page, currentProductCount);
  }

  /**
   * Count current products on page
   */
  private async countProducts(page: Page): Promise<number> {
    try {
      const productElements = await page.$$('[class^="MenuContent__tit__"]');
      return productElements.length;
    } catch (error) {
      logger.debug('Error counting products:', {
        message: (error as Error).message,
        error,
      });
      return 0;
    }
  }

  /**
   * Perform a single scroll step
   */
  private async performScrollStep(
    page: Page,
    scrollAttempts: number
  ): Promise<void> {
    // Basic scroll
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });
    await page.waitForTimeout(800);

    // Container scrolling every 3rd attempt
    if (scrollAttempts % 3 === 0) {
      await this.scrollContainers(page);
    }
  }

  /**
   * Scroll containers within the page
   */
  private async scrollContainers(page: Page): Promise<void> {
    try {
      await page.evaluate(() => {
        const selectors = [
          '[class*="scroll"]',
          '[class*="container"]',
          '[class*="list"]',
          '[class*="menu"]',
          '[class*="content"]',
          '[class*="items"]',
        ];

        for (const selector of selectors) {
          const containers = document.querySelectorAll(selector);
          for (const container of containers) {
            const containerElement = container as HTMLElement;
            if (
              containerElement &&
              containerElement.scrollHeight > containerElement.clientHeight
            ) {
              containerElement.scrollBy(0, containerElement.clientHeight * 0.8);
            }
          }
        }
      });
      await page.waitForTimeout(600);
    } catch (_error) {
      logger.debug('Error scrolling containers', { error: _error });
    }
  }

  /**
   * Check if scrolling should stop
   */
  private checkStopCondition(
    currentCount: number,
    previousCount: number,
    noChangeCount: number
  ): { stop: boolean; break: boolean; noChangeCount: number } {
    if (currentCount === previousCount) {
      const newNoChangeCount = noChangeCount + 1;
      if (newNoChangeCount % 5 === 0) {
        logger.info(
          `No new products loaded (${newNoChangeCount} consecutive attempts)`
        );
      }

      if (newNoChangeCount >= 6) {
        logger.info(
          `No new products loaded after ${newNoChangeCount} consecutive attempts, stopping scroll`
        );
        return { stop: true, break: true, noChangeCount: newNoChangeCount };
      }

      return { stop: true, break: false, noChangeCount: newNoChangeCount };
    }

    return { stop: false, break: false, noChangeCount: 0 };
  }

  /**
   * Take screenshot after scrolling
   */
  private async takeScrollScreenshot(
    page: Page,
    productCount: number
  ): Promise<void> {
    logger.info(`Finished scrolling. Final product count: ${productCount}`);

    await page.screenshot({
      path: 'actors/pricer/after-scroll-screenshot.png',
      fullPage: true,
    });
    logger.info('Screenshot after scrolling saved');
  }

  /**
   * Find menu items on the page using the specific selector
   */
  private async findMenuItems(page: Page): Promise<ElementHandle[]> {
    const pageTitle = await page.title();
    logger.info(`Page title: "${pageTitle}"`);

    try {
      const menuItems = await page.$$('[class^="MenuContent__tit__"]');
      if (menuItems.length > 0) {
        logger.info(`Found ${menuItems.length} menu items`);

        // Get parent containers that contain both title and price information
        const parentItems: ElementHandle[] = [];
        for (const item of menuItems) {
          try {
            const parent = await item.evaluateHandle((el) => {
              let current = el.parentElement;
              while (current) {
                const priceElement = current.querySelector(
                  '[class*="__price__"], [class*="price"]'
                );
                if (priceElement) {
                  return current;
                }
                current = current.parentElement;
              }
              return el.parentElement || el;
            });
            parentItems.push(parent);
          } catch (_error) {
            parentItems.push(item);
          }
        }
        return parentItems;
      }
    } catch (error) {
      logger.debug('Error finding menu items:', {
        message: (error as Error).message,
        error,
      });
    }

    logger.warn('No menu items found');
    return [];
  }

  /**
   * Extract product data from a single menu item
   */
  private async extractProductFromItem(
    item: ElementHandle,
    timestamp: number
  ): Promise<ProductPrice | null> {
    try {
      // Get product name from title element
      const nameElement = await item.$('[class^="MenuContent__tit__"]');

      // Get price from price element
      const priceElement =
        (await item.$('.MenuContent__price__lhCy9 strong')) ||
        (await item.$('[class*="__price__"] strong'));

      if (nameElement && priceElement) {
        const name = await nameElement.textContent();
        const priceText = await priceElement.textContent();

        if (name && priceText) {
          const normalizedName = PricerUtils.normalizeProductName(name);
          const price = PricerUtils.parsePrice(priceText);

          if (normalizedName && price !== null && price > 0) {
            return {
              productName: normalizedName,
              price,
              cafeSlug: this.CAFE_SLUG,
              source: this.SOURCE,
              timestamp,
            };
          }
        }
      }
    } catch (itemError) {
      logger.debug('Failed to extract data from menu item:', {
        message: (itemError as Error).message,
        error: itemError,
      });
    }

    return null;
  }

  /**
   * Ensure the page is in Korean language
   */
  private async ensureKoreanLanguage(page: Page): Promise<void> {
    logger.info('Checking and ensuring Korean language...');

    try {
      // Check if we see Korean text on the page
      const bodyText = await page.textContent('body');
      const hasKorean = KOREAN_REGEX.test(bodyText || '');

      if (hasKorean) {
        logger.info('Page is already in Korean');
      } else {
        logger.warn(
          'Page appears to be in English, attempting to switch to Korean...'
        );

        // Try to find and click Korean language option
        const koreanButtons = await page.$$(
          'button:has-text("한국어"), a:has-text("한국어"), [lang="ko"], [data-lang="ko"]'
        );
        for (const button of koreanButtons) {
          try {
            await button.click();
            logger.info('Clicked Korean language button');
            await page.waitForTimeout(3000);
            break;
          } catch (_error) {
            // Continue to next button
          }
        }

        // If that didn't work, try refreshing with Korean URL params
        const currentUrl = page.url();
        if (!currentUrl.includes('lang=ko')) {
          const newUrl = currentUrl.includes('?')
            ? `${currentUrl}&lang=ko`
            : `${currentUrl}?lang=ko`;
          logger.info(`Reloading with Korean language parameter: ${newUrl}`);
          await page.goto(newUrl);
          await page.waitForTimeout(3000);
        }
      }
    } catch (error) {
      logger.debug('Error while ensuring Korean language:', {
        message: (error as Error).message,
        error,
      });
    }
  }

  /**
   * Ensure we're on the Menu tab and ready to scroll
   */
  private async ensureMenuTab(page: Page): Promise<void> {
    logger.info('Ensuring we are on the Menu tab...');

    try {
      // Look for Menu tab specifically
      const menuTab = await page.$('[role="tab"]:has-text("Menu")');

      if (menuTab) {
        logger.info('Found Menu tab, clicking to ensure it is selected...');
        await menuTab.click();
        await page.waitForTimeout(3000); // Wait for content to load
        logger.info('Menu tab clicked successfully');
      } else {
        // Try finding "메뉴" tab in Korean
        const koreanMenuTab = await page.$('[role="tab"]:has-text("메뉴")');
        if (koreanMenuTab) {
          logger.info('Found 메뉴 tab, clicking to ensure it is selected...');
          await koreanMenuTab.click();
          await page.waitForTimeout(3000);
          logger.info('메뉴 tab clicked successfully');
        } else {
          logger.info(
            'No specific Menu tab found, proceeding with current view'
          );
        }
      }
    } catch (error) {
      logger.debug('Error while ensuring menu tab:', {
        message: (error as Error).message,
        error,
      });
    }
  }

  /**
   * Extract product prices from Naver Map page
   */
  private async extractPricesFromPage(page: Page): Promise<ProductPrice[]> {
    try {
      // Wait for the page to load with longer timeout
      try {
        await page.waitForLoadState('domcontentloaded', { timeout: 10_000 });
        logger.info('Page DOM loaded successfully');
      } catch (loadError) {
        logger.warn(
          'Failed to wait for DOM load, continuing anyway:',
          (loadError as Error).message
        );
      }

      // Take an initial screenshot to see what we got
      await page.screenshot({
        path: 'actors/pricer/initial-page-screenshot.png',
        fullPage: true,
      });
      logger.info('Initial page screenshot saved');

      await page.waitForTimeout(8000); // Wait longer for dynamic content to load

      // Check if page is in Korean, if not try to switch it back
      await this.ensureKoreanLanguage(page);

      // Ensure we're on the Menu tab
      await this.ensureMenuTab(page);

      // Wait for products to load after clicking menu tab
      await page.waitForTimeout(5000);

      // Wait for the first products to be visible before scrolling
      try {
        await page.waitForSelector('[class^="MenuContent__tit__"]', {
          timeout: 10_000,
        });
        logger.info('Products are starting to load, proceeding with scroll');
      } catch (_error) {
        logger.warn(
          'Products did not load within 10 seconds, proceeding anyway'
        );
      }

      // Scroll to load all products (now faster)
      await this.scrollToLoadAllProducts(page);

      // Now find the current menu items on the page to extract prices
      const menuItems = await this.findMenuItems(page);

      if (menuItems.length === 0) {
        // If no specific selectors work, try to find any elements with Korean won symbol
        const priceElements = await page.$$('*:has-text("원")');
        logger.info(`Found ${priceElements.length} elements containing "원"`);

        // Take screenshot for debugging
        await page.screenshot({
          path: 'actors/pricer/debug-screenshot.png',
          fullPage: true,
        });

        return [];
      }

      // Extract product data from menu items currently visible
      const productPrices: ProductPrice[] = [];
      const timestamp = Date.now();

      for (const item of menuItems) {
        const product = await this.extractProductFromItem(item, timestamp);
        if (product) {
          productPrices.push(product);
          logger.info(
            `Found product: ${product.productName} - ${product.price}원`
          );
        }
      }

      logger.info(
        `Extracted prices for ${productPrices.length} products from currently visible items`
      );
      return productPrices;
    } catch (error) {
      logger.error('Failed to extract prices from page:', error);

      // Take debug screenshot
      try {
        await page.screenshot({
          path: 'actors/pricer/error-screenshot.png',
          fullPage: true,
        });
      } catch (screenshotError) {
        logger.error('Failed to take debug screenshot:', screenshotError);
      }

      throw error;
    }
  }

  /**
   * Run the Starbucks pricer
   */
  async run(): Promise<PricerResult> {
    logger.info('Starting Starbucks price collection from Naver Map...');

    const crawler = new PlaywrightCrawler({
      launchContext: {
        launchOptions: {
          headless: false, // Run in headed mode to see what happens
          locale: 'ko-KR', // Force Korean locale
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-blink-features=AutomationControlled',
            '--disable-extensions',
            '--lang=ko-KR', // Force Korean language
            '--disable-translate', // Disable Google Translate
          ],
        },
      },
      maxRequestsPerCrawl: 1,
      requestHandlerTimeoutSecs: 180, // 3 minutes timeout for scrolling
      navigationTimeoutSecs: 60, // Navigation timeout
    });

    let result: PricerResult = {
      success: false,
      productsProcessed: 0,
      pricesUpdated: 0,
      priceHistoryEntries: 0,
      errors: [],
    };

    // Set up the request handler with Korean language enforcement
    crawler.router.addDefaultHandler(async ({ page, request }) => {
      try {
        logger.info(`Processing URL: ${request.loadedUrl}`);

        // Force Korean locale before navigation
        await page.addInitScript(() => {
          // Override navigator language to Korean BEFORE page loads
          Object.defineProperty(navigator, 'language', {
            value: 'ko-KR',
            configurable: true,
          });
          Object.defineProperty(navigator, 'languages', {
            value: ['ko-KR', 'ko'],
            configurable: true,
          });

          // Disable auto-translation and force Korean
          const originalFetch = window.fetch;
          window.fetch = function (...args) {
            // If it's a request that might change language, intercept it
            const url = args[0];
            if (typeof url === 'string' && url.includes('lang=')) {
              args[0] = url.replace(/lang=[^&]*/g, 'lang=ko');
            }
            return originalFetch.apply(this, args);
          };

          // Prevent Google Translate
          window.addEventListener('DOMContentLoaded', () => {
            const metaTag = document.createElement('meta');
            metaTag.name = 'google';
            metaTag.content = 'notranslate';
            document.head.appendChild(metaTag);

            // Force Korean language in local storage if available
            try {
              localStorage.setItem('language', 'ko');
              localStorage.setItem('locale', 'ko-KR');
            } catch (_e) {
              // Ignore localStorage errors in case it's not available
            }
          });
        });

        // Set headers to ensure Korean content
        await page.setExtraHTTPHeaders({
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        });

        // Only intercept specific language-changing requests
        await page.route('**/order/bizes/**', async (route, routeRequest) => {
          const url = routeRequest.url();

          // Only redirect if it's explicitly changing to English
          if (url.includes('lang=en')) {
            const modifiedUrl = url.replace(/lang=en/g, 'lang=ko');
            logger.info(
              `Redirecting page request to Korean: ${url} → ${modifiedUrl}`
            );
            await route.fulfill({
              status: 302,
              headers: { Location: modifiedUrl },
            });
          } else {
            await route.continue();
          }
        });

        // Extract product prices
        const productPrices = await this.extractPricesFromPage(page);

        if (productPrices.length === 0) {
          const errorMsg = 'No products found on Naver Map page';
          logger.error(errorMsg);
          result.errors.push(errorMsg);
          return;
        }

        logger.info(`Found ${productPrices.length} products with prices`);

        // Process the prices
        result = await this.pricerUtils.processPrices(productPrices);
      } catch (error) {
        const errorMessage = `Failed to process Naver Map page: ${(error as Error).message}`;
        logger.error(errorMessage);
        result.errors.push(errorMessage);
      }
    });

    try {
      await crawler.run([
        {
          url: this.NAVER_MAP_URL,
          userData: {},
        },
      ]);

      logger.info(
        `Starbucks pricer completed. Processed: ${result.productsProcessed}, Updated: ${result.pricesUpdated}, Errors: ${result.errors.length}`
      );
    } catch (error) {
      const errorMessage = `Starbucks pricer failed: ${(error as Error).message}`;
      logger.error(errorMessage);
      result.errors.push(errorMessage);
    } finally {
      await crawler.teardown();
    }

    return result;
  }
}

export default StarbucksPricer;
