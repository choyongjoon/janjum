/**
 * Crawler Registry - Auto-registers all crawlers
 *
 * Import this file to register all available crawlers with the registry.
 */

// Import crawlers to register them
// Inline-data strategy crawlers (fully migrated)
import './paik';
import './ediya';
import './coffeebean';
import './compose';
import './mega';

// List-detail strategy crawlers (fully migrated)
import './starbucks';
import './gongcha';

// Wrapper crawlers (using existing implementations)
import './twosome';
import './hollys';
import './mammoth';
import './paulbassett';

// Re-export registry functions for convenience
export {
  getCrawler,
  getRegisteredBrands,
  hasCrawler,
  runAllCrawlers,
  runCrawler,
} from '../core';
