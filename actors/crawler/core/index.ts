// Core types and interfaces

// Base crawler class
export { BaseCrawler } from './BaseCrawler';
// Crawler registry
export {
  defineCrawler,
  getCrawler,
  getRegisteredBrands,
  hasCrawler,
  registerCrawler,
  runAllCrawlers,
  runCrawler,
} from './CrawlerRegistry';
export * from './types';
