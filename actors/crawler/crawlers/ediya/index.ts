import { logger } from '../../../../shared/logger';
import { registerCrawler } from '../../core';
import { InlineDataCrawler } from '../../strategies/InlineDataCrawler';
import { ediyaDefinition } from './config';

// Factory function to create Ediya crawler
function createEdiyaCrawler(): InlineDataCrawler {
  return new InlineDataCrawler(ediyaDefinition);
}

// Register the crawler factory
registerCrawler(ediyaDefinition.config.brand, createEdiyaCrawler);

export { ediyaDefinition } from './config';
export { createEdiyaCrawler };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  createEdiyaCrawler()
    .run()
    .catch((error) => {
      logger.error('Crawler execution failed:', error);
      process.exit(1);
    });
}
