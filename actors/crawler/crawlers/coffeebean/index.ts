import { logger } from '../../../../shared/logger';
import { registerCrawler } from '../../core';
import { InlineDataCrawler } from '../../strategies/InlineDataCrawler';
import { coffeebeanDefinition } from './config';

// Create and register the Coffeebean crawler
const coffeebeanCrawler = new InlineDataCrawler(coffeebeanDefinition);

registerCrawler(coffeebeanDefinition.config.brand, {
  definition: coffeebeanDefinition,
  crawler: coffeebeanCrawler,
});

export { coffeebeanDefinition } from './config';
export { coffeebeanCrawler };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  coffeebeanCrawler.run().catch((error) => {
    logger.error('Crawler execution failed:', error);
    process.exit(1);
  });
}
