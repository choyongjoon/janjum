import type { PlaywrightCrawler, Request } from 'crawlee';
import type { Locator, Page } from 'playwright';
import type { Nutritions } from '../../../shared/nutritions';

// ================================================
// PRODUCT TYPES
// ================================================

export interface Product {
  name: string;
  nameEn: string | null;
  description: string | null;
  price: number | null;
  externalImageUrl: string;
  category: string | null;
  externalCategory: string;
  externalId: string;
  externalUrl: string;
  nutritions?: Nutritions | null;
}

// ================================================
// STRATEGY TYPES
// ================================================

export type CrawlerStrategyType = 'list-detail' | 'inline-data' | 'modal';

export type PaginationType =
  | 'none'
  | 'load-more'
  | 'page-numbers'
  | 'next-button';

// ================================================
// CONFIGURATION TYPES
// ================================================

export interface SiteConfig {
  /** Brand identifier (e.g., 'starbucks', 'ediya') */
  brand: string;
  /** Base URL of the site */
  baseUrl: string;
  /** Starting URL for crawling */
  startUrl: string;
  /** Optional: predefined category URLs */
  categoryUrls?: string[];
  /** Optional: template for product detail URLs */
  productUrlTemplate?: string;
}

export interface SelectorConfig {
  /** Selector for product container elements */
  productContainers: string | string[];
  /** Selectors for extracting product data */
  productData: {
    name: string;
    nameEn?: string;
    description?: string;
    image: string;
    price?: string;
    link?: string;
  };
  /** Selector for nutrition information */
  nutrition?: string | string[];
  /** Selector for category links/tabs */
  categoryLinks?: string;
  /** Pagination selectors */
  pagination?: {
    loadMore?: string;
    nextButton?: string;
    pageLinks?: string;
  };
}

export interface CrawlerOptions {
  /** Maximum concurrent requests */
  maxConcurrency: number;
  /** Maximum requests per crawl session */
  maxRequestsPerCrawl: number;
  /** Maximum request retries */
  maxRequestRetries: number;
  /** Request handler timeout in seconds */
  requestHandlerTimeoutSecs: number;
  /** Browser launch options */
  launchOptions: {
    headless: boolean;
    args: string[];
  };
}

// ================================================
// EXTRACTOR TYPES
// ================================================

export interface ProductExtractorResult {
  name: string;
  nameEn: string | null;
  description: string | null;
  imageUrl: string;
  nutritions?: Nutritions | null;
  price: number | null;
  externalId?: string;
  externalUrl?: string;
}

export type ProductExtractor = (
  container: Locator,
  context: ExtractorContext
) => Promise<ProductExtractorResult | null>;

export type NutritionExtractor = (
  element: Locator | Page,
  context: ExtractorContext
) => Promise<Nutritions | null>;

export type CategoryExtractor = (
  page: Page,
  context: ExtractorContext
) => Promise<CategoryInfo[]>;

export interface CategoryInfo {
  name: string;
  url: string;
  id?: string;
}

export interface ExtractorContext {
  baseUrl: string;
  categoryName?: string;
  pageUrl?: string;
}

// ================================================
// CRAWLER DEFINITION
// ================================================

export interface CrawlerDefinition {
  /** Site configuration */
  config: SiteConfig;
  /** CSS selectors */
  selectors: SelectorConfig;
  /** Regex patterns for data extraction */
  patterns?: Record<string, RegExp>;
  /** Crawling strategy type */
  strategy: CrawlerStrategyType;
  /** Pagination strategy type */
  pagination: PaginationType;
  /** Crawler options (optional, uses defaults if not provided) */
  options?: Partial<CrawlerOptions>;
  /** Custom product extractor (optional) */
  extractProduct?: ProductExtractor;
  /** Custom nutrition extractor (optional) */
  extractNutrition?: NutritionExtractor;
  /** Custom category extractor (optional) */
  extractCategories?: CategoryExtractor;
  /** Custom request handler for special cases */
  customHandler?: (context: HandlerContext) => Promise<void>;
}

export interface HandlerContext {
  page: Page;
  request: Request;
  crawler: PlaywrightCrawler;
  definition: CrawlerDefinition;
}

// ================================================
// TEST MODE CONFIGURATION
// ================================================

export interface TestModeConfig {
  enabled: boolean;
  maxProducts: number;
  maxRequests: number;
  maxCategories: number;
}

export function getTestModeConfig(): TestModeConfig {
  const isTestMode = process.env.CRAWLER_TEST_MODE === 'true';
  return {
    enabled: isTestMode,
    maxProducts: isTestMode
      ? Number.parseInt(process.env.CRAWLER_MAX_PRODUCTS || '3', 10)
      : Number.POSITIVE_INFINITY,
    maxRequests: isTestMode
      ? Number.parseInt(process.env.CRAWLER_MAX_REQUESTS || '10', 10)
      : Number.POSITIVE_INFINITY,
    maxCategories: isTestMode ? 1 : Number.POSITIVE_INFINITY,
  };
}

// ================================================
// DEFAULT CRAWLER OPTIONS
// ================================================

export const DEFAULT_CRAWLER_OPTIONS: CrawlerOptions = {
  maxConcurrency: 3,
  maxRequestsPerCrawl: 100,
  maxRequestRetries: 2,
  requestHandlerTimeoutSecs: 60,
  launchOptions: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
};

export function getCrawlerOptions(
  customOptions?: Partial<CrawlerOptions>,
  testMode?: TestModeConfig
): CrawlerOptions {
  const base = { ...DEFAULT_CRAWLER_OPTIONS, ...customOptions };

  if (testMode?.enabled) {
    return {
      ...base,
      maxConcurrency: Math.min(base.maxConcurrency, 2),
      maxRequestsPerCrawl: Math.min(
        base.maxRequestsPerCrawl,
        testMode.maxRequests
      ),
      requestHandlerTimeoutSecs: Math.min(base.requestHandlerTimeoutSecs, 30),
    };
  }

  return base;
}
