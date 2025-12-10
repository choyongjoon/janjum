import { logger } from '../../../../shared/logger';
import { registerCrawler } from '../../core';
import { InlineDataCrawler } from '../../strategies/InlineDataCrawler';
import { composeDefinition } from './config';

// Create and register the Compose crawler
const composeCrawler = new InlineDataCrawler(composeDefinition);

registerCrawler(composeDefinition.config.brand, {
  definition: composeDefinition,
  crawler: composeCrawler,
});

export { composeDefinition } from './config';
export { composeCrawler };

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  composeCrawler.run().catch((error) => {
    logger.error('Crawler execution failed:', error);
    process.exit(1);
  });
}
