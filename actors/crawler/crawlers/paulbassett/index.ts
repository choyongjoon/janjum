// Paul Bassett crawler - Wrapper for existing implementation
// The existing paulbassett-crawler.ts has complex page interactions.
// This wrapper registers it with the new architecture while preserving the implementation.

import { logger } from '../../../../shared/logger';
import { defineCrawler, registerCrawler } from '../../core';
import type { BaseCrawler } from '../../core/BaseCrawler';
import { runPaulBassettCrawler } from '../../paulbassett-crawler';

// Define the crawler configuration for registry
export const paulbassettDefinition = defineCrawler({
  config: {
    brand: 'paulbassett',
    baseUrl: 'https://www.baristapaulbassett.co.kr',
    startUrl: 'https://www.baristapaulbassett.co.kr/menu/list?category=1',
  },
  selectors: {
    productContainers: '.menu-list li',
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
class PaulBassettCrawlerWrapper {
  async run(): Promise<void> {
    await runPaulBassettCrawler();
  }
}

// Factory function to create the wrapper
function createPaulBassettCrawler(): BaseCrawler {
  return new PaulBassettCrawlerWrapper() as unknown as BaseCrawler;
}

// Register with the crawler registry
registerCrawler('paulbassett', createPaulBassettCrawler);

export { paulbassettDefinition as definition };
export { createPaulBassettCrawler };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runPaulBassettCrawler()
    .then(() => {
      logger.info('Paul Bassett crawler completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Crawler execution failed:', error);
      process.exit(1);
    });
}
