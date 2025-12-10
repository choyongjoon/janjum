import { logger } from '../../../../shared/logger';
import { registerCrawler } from '../../core';
import { InlineDataCrawler } from '../../strategies/InlineDataCrawler';
import { ediyaDefinition } from './config';

// Create and register the Ediya crawler
const ediyaCrawler = new InlineDataCrawler(ediyaDefinition);

registerCrawler(ediyaDefinition.config.brand, {
  definition: ediyaDefinition,
  crawler: ediyaCrawler,
});

export { ediyaDefinition } from './config';
export { ediyaCrawler };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  ediyaCrawler.run().catch((error) => {
    logger.error('Crawler execution failed:', error);
    process.exit(1);
  });
}
