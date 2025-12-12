import { logger } from '../../../../shared/logger';
import { registerCrawler } from '../../core';
import { InlineDataCrawler } from '../../strategies/InlineDataCrawler';
import { coffeebeanDefinition } from './config';

// Factory function to create Coffeebean crawler
function createCoffeebeanCrawler(): InlineDataCrawler {
  return new InlineDataCrawler(coffeebeanDefinition);
}

// Register the crawler factory
registerCrawler(coffeebeanDefinition.config.brand, createCoffeebeanCrawler);

export { coffeebeanDefinition } from './config';
export { createCoffeebeanCrawler };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createCoffeebeanCrawler()
    .run()
    .catch((error) => {
      logger.error('Crawler execution failed:', error);
      process.exit(1);
    });
}
