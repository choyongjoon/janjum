// Mammoth crawler - Wrapper for existing implementation
// The existing mammoth-crawler.ts has complex page interactions.
// This wrapper registers it with the new architecture while preserving the implementation.

import { logger } from '../../../../shared/logger';
import { defineCrawler, registerCrawler } from '../../core';
import { createMammothCrawler, runMammothCrawler } from '../../mammoth-crawler';

// Define the crawler configuration for registry
export const mammothDefinition = defineCrawler({
  config: {
    brand: 'mammoth',
    baseUrl: 'https://mammothcoffee.co.kr',
    startUrl: 'https://mammothcoffee.co.kr/menu/menu.html',
  },
  selectors: {
    productContainers: '.menu-item',
    productData: {
      name: '.menu-name',
      image: 'img',
    },
  },
  strategy: 'list-detail',
  pagination: 'none',
  options: {
    maxConcurrency: 2,
    maxRequestsPerCrawl: 100,
    requestHandlerTimeoutSecs: 120,
  },
});

// Create a wrapper object that matches the BaseCrawler interface
const mammothCrawlerWrapper = {
  create: createMammothCrawler,
  run: runMammothCrawler,
};

// Register with the crawler registry
registerCrawler('mammoth', {
  definition: mammothDefinition,
  crawler: mammothCrawlerWrapper as never,
});

export { mammothDefinition as definition };
export { mammothCrawlerWrapper as mammothCrawler };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMammothCrawler()
    .then(() => {
      logger.info('Mammoth crawler completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Crawler execution failed:', error);
      process.exit(1);
    });
}
