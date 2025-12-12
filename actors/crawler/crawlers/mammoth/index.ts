// Mammoth crawler - Wrapper for existing implementation
// The existing mammoth-crawler.ts has complex page interactions.
// This wrapper registers it with the new architecture while preserving the implementation.

import { logger } from '../../../../shared/logger';
import { defineCrawler, registerCrawler } from '../../core';
import type { BaseCrawler } from '../../core/BaseCrawler';
import { runMammothCrawler } from '../../mammoth-crawler';

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

// Create a wrapper class that implements the BaseCrawler interface
class MammothCrawlerWrapper {
  async run(): Promise<void> {
    await runMammothCrawler();
  }
}

// Factory function to create the wrapper
function createMammothCrawler(): BaseCrawler {
  return new MammothCrawlerWrapper() as unknown as BaseCrawler;
}

// Register with the crawler registry
registerCrawler('mammoth', createMammothCrawler);

export { mammothDefinition as definition };
export { createMammothCrawler };

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
