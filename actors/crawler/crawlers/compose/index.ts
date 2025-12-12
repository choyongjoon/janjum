import { logger } from '../../../../shared/logger';
import { registerCrawler } from '../../core';
import { InlineDataCrawler } from '../../strategies/InlineDataCrawler';
import { composeDefinition } from './config';

// Factory function to create Compose crawler
function createComposeCrawler(): InlineDataCrawler {
  return new InlineDataCrawler(composeDefinition);
}

// Register the crawler factory
registerCrawler(composeDefinition.config.brand, createComposeCrawler);

export { composeDefinition } from './config';
export { createComposeCrawler };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createComposeCrawler()
    .run()
    .catch((error) => {
      logger.error('Crawler execution failed:', error);
      process.exit(1);
    });
}
