import { logger } from '../../../../shared/logger';
import { registerCrawler } from '../../core';
import { createInlineDataCrawler } from '../../strategies';
import { paikDefinition } from './config';

// Create the crawler instance
export function createPaikCrawlerV2() {
  return createInlineDataCrawler(paikDefinition);
}

// Register the crawler
registerCrawler('paik', createPaikCrawlerV2);

// Run function for direct execution
export async function runPaikCrawlerV2() {
  const crawler = createPaikCrawlerV2();
  await crawler.run();
}

// Export definition for reference
export { paikDefinition } from './config';

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runPaikCrawlerV2().catch((error) => {
    logger.error('Paik crawler execution failed:', error);
    process.exit(1);
  });
}
