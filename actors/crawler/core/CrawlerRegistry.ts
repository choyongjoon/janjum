import { logger } from '../../../shared/logger';
import type { BaseCrawler } from './BaseCrawler';
import type { CrawlerDefinition } from './types';

// ================================================
// CRAWLER REGISTRY
// ================================================

type CrawlerFactory = () => BaseCrawler;

const registry = new Map<string, CrawlerFactory>();

/**
 * Register a crawler factory
 */
export function registerCrawler(brand: string, factory: CrawlerFactory): void {
  if (registry.has(brand)) {
    logger.warn(`Crawler '${brand}' is already registered, overwriting...`);
  }
  registry.set(brand, factory);
  logger.debug(`Registered crawler: ${brand}`);
}

/**
 * Get a crawler instance by brand name
 */
export function getCrawler(brand: string): BaseCrawler | null {
  const factory = registry.get(brand);
  if (!factory) {
    logger.error(`Crawler '${brand}' not found in registry`);
    return null;
  }
  return factory();
}

/**
 * Get all registered crawler brands
 */
export function getRegisteredBrands(): string[] {
  return Array.from(registry.keys());
}

/**
 * Check if a crawler is registered
 */
export function hasCrawler(brand: string): boolean {
  return registry.has(brand);
}

/**
 * Run a crawler by brand name
 */
export async function runCrawler(brand: string): Promise<void> {
  const crawler = getCrawler(brand);
  if (!crawler) {
    throw new Error(`Crawler '${brand}' not found`);
  }
  await crawler.run();
}

/**
 * Run all registered crawlers
 */
export async function runAllCrawlers(
  options: { sequential?: boolean } = {}
): Promise<void> {
  const brands = getRegisteredBrands();
  logger.info(`Running ${brands.length} crawlers...`);

  if (options.sequential) {
    for (const brand of brands) {
      try {
        await runCrawler(brand);
      } catch (error) {
        logger.error(`Crawler '${brand}' failed:`, error);
      }
    }
  } else {
    await Promise.allSettled(brands.map((brand) => runCrawler(brand)));
  }
}

// ================================================
// DEFINITION HELPER
// ================================================

/**
 * Define a crawler configuration (helper for type safety)
 */
export function defineCrawler(
  definition: CrawlerDefinition
): CrawlerDefinition {
  return definition;
}
