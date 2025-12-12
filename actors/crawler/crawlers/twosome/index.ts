// Twosome crawler - Wrapper for existing implementation
// The existing twosome-crawler.ts has complex UI interactions that require
// clicking category elements and navigating to detail pages for nutrition.
// This wrapper registers it with the new architecture while preserving the implementation.

import { logger } from '../../../../shared/logger';
import { defineCrawler, registerCrawler } from '../../core';
import type { BaseCrawler } from '../../core/BaseCrawler';
import { runTwosomeCrawler } from '../../twosome-crawler';

// Define the crawler configuration for registry
export const twosomeDefinition = defineCrawler({
  config: {
    brand: 'twosome',
    baseUrl: 'https://mo.twosome.co.kr',
    startUrl: 'https://mo.twosome.co.kr/mn/menuInfoList.do',
    productUrlTemplate: 'https://mo.twosome.co.kr/mn/menuInfoDetail.do?menuCd=',
  },
  selectors: {
    productContainers: 'ul.ui-goods-list-default > li',
    productData: {
      name: '.menu-title',
      image: '.thum-img > img',
      link: 'a',
    },
  },
  strategy: 'list-detail',
  pagination: 'none',
  options: {
    maxConcurrency: 1,
    maxRequestsPerCrawl: 200,
    requestHandlerTimeoutSecs: 600,
  },
});

// Create a wrapper class that implements the BaseCrawler interface
class TwosomeCrawlerWrapper {
  async run(): Promise<void> {
    await runTwosomeCrawler();
  }
}

// Factory function to create the wrapper
function createTwosomeCrawler(): BaseCrawler {
  return new TwosomeCrawlerWrapper() as unknown as BaseCrawler;
}

// Register with the crawler registry
registerCrawler('twosome', createTwosomeCrawler);

export { twosomeDefinition as definition };
export { createTwosomeCrawler };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTwosomeCrawler()
    .then(() => {
      logger.info('Twosome crawler completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Crawler execution failed:', error);
      process.exit(1);
    });
}
