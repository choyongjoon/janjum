// Strategy implementations
export {
  createInlineDataCrawler,
  InlineDataCrawler,
} from './InlineDataCrawler';
export {
  createListDetailCrawler,
  ListDetailCrawler,
} from './ListDetailCrawler';

import type { BaseCrawler } from '../core/BaseCrawler';
// Factory function to create crawler based on strategy type
import type { CrawlerDefinition } from '../core/types';
import { InlineDataCrawler } from './InlineDataCrawler';
import { ListDetailCrawler } from './ListDetailCrawler';

export function createCrawlerFromDefinition(
  definition: CrawlerDefinition
): BaseCrawler {
  switch (definition.strategy) {
    case 'inline-data':
    case 'modal':
      return new InlineDataCrawler(definition);
    case 'list-detail':
      return new ListDetailCrawler(definition);
    default:
      throw new Error(`Unknown crawler strategy: ${definition.strategy}`);
  }
}
