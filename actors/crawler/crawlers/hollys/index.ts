// Hollys crawler - Wrapper for existing implementation
// The existing hollys-crawler.ts has complex page interactions.
// This wrapper registers it with the new architecture while preserving the implementation.

import { logger } from '../../../../shared/logger';
import { defineCrawler, registerCrawler } from '../../core';
import type { BaseCrawler } from '../../core/BaseCrawler';
import { runHollysCrawler } from '../../hollys-crawler';

// Define the crawler configuration for registry
export const hollysDefinition = defineCrawler({
  config: {
    brand: 'hollys',
    baseUrl: 'https://www.hollys.co.kr',
    startUrl: 'https://www.hollys.co.kr/menu/espresso.do',
  },
  selectors: {
    productContainers: '.menu_list li',
    productData: {
      name: '.menu_name',
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
class HollysCrawlerWrapper {
  async run(): Promise<void> {
    await runHollysCrawler();
  }
}

// Factory function to create the wrapper
function createHollysCrawler(): BaseCrawler {
  return new HollysCrawlerWrapper() as unknown as BaseCrawler;
}

// Register with the crawler registry
registerCrawler('hollys', createHollysCrawler);

export { hollysDefinition as definition };
export { createHollysCrawler };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runHollysCrawler()
    .then(() => {
      logger.info('Hollys crawler completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Crawler execution failed:', error);
      process.exit(1);
    });
}
